# Development, hosting and verification

Moved from the README.

## Running locally

```bash
# Install dependencies
npm install

# Start the dev server at http://localhost:3000
npm run dev
```

Startup uses an existing local pipeline snapshot, or downloads the published
dataset from `https://ovberlin.online/movies.json`. It never starts a scrape or
spends model credits automatically. If the download fails, it keeps a valid
existing local dataset and prints a warning. Provider keys stay server-side.

To refresh just the local dataset while the server is running, run
`npm run data:sync` and reload the page.

To run the scraping and enrichment pipeline locally instead:

```bash
# Copy and fill in API keys (server-side only)
cp .env.example .env   # set TMDB_API_KEY and optionally OMDB_API_KEY

# Run the full scraper (writes public/movies.json)
npm run scrape

# Or run each step individually
npx ts-node --project tsconfig.server.json scripts/scrape-critic-de.ts # collects critic.de
npx ts-node --project tsconfig.server.json scripts/scrape-berlin-de.ts # collects berlin.de
npx ts-node --project tsconfig.server.json scripts/merge.ts           # publishes retained collections

# Recalculate from retained collections and observations without scraping
npm run pipeline:replay

# Process cached raw files without replacing the public dataset
npm run pipeline:shadow -- --offline

# Start the local review server (builds the frontend first)
npm run admin
# Open http://127.0.0.1:3003/admin/review
```

Sources are configured instances of reusable adapters. Set `SOURCE_DISABLED`
to a comma-separated list of instance IDs, or use `SOURCE_INSTANCES_FILE` for
explicit configuration. Existing evidence and corrections remain eligible until
their normal expiry. See [source adapters](source-adapters.md) for the
collection interface, cache compatibility and fixture-backed extension example.
See [source recovery](source-recovery.md) for scoped completeness, retry
limits, run outcomes, local diagnostics and public empty/stale/reload behavior.

GitHub Actions secrets cannot be read back through the GitHub settings page or API.
For direct local API calls, obtain keys from the providers and put them in `.env`
(which is ignored by git). A refresh without keys can reuse metadata previously
verified by this pipeline. Pre-migration inferred enrichment is retained for
inspection but is not silently accepted as a verified identity.

### Local review and rollout

The local server listens only on `127.0.0.1`. It accepts writes only from its own
browser origin and JSON forms. The public audit remains read-only. Review issues
retain source evidence, candidates and model outcomes; repeated runs update the
same issue. Changed evidence reopens a previously reviewed issue.

Use the queue to link or separate identities, correct parsed properties, select
a metadata candidate, correct a field, or reconcile screenings. Each item shows
a field-by-source comparison, with different values and missing data labelled
separately. Same-title records that have not been linked are marked as context.
The recorded rule, missing evidence, model confidence/threshold, API failure,
budget limit or missing provider explains why automation stopped; older runs
do not invent diagnostics they did not record. Choose a resolution or use the
custom form. Custom TMDb IDs/URLs are retrieved before they can be accepted.
Preview each change before applying it. Decisions persist until revoked, with source identity
changes flagged for another review. Applying/undoing a correction queues local
regeneration, with saved/processing/published/failed status. No source scrape is
needed. Unchanged decisions and resource lookups are reused.

Custom `PIPELINE_STATE` paths remain explicit; migrate/export deliberately before replacing the scheduled state.
Local state is your own copy; production corrections belong in the production review UI.
Current state is loaded into memory. Partition the store if history grows substantially.

The production runner reads `TMDB_API_KEY` and `OMDB_API_KEY` from
`$OVB_ROOT/secrets.env` on the server; optional `GEOAPIFY_API_KEY` enables extra
venue verification. No decision-model credentials are required: deterministic
rules run normally and ambiguous evidence stays available for local review.

Actions and local `npm run scrape` default to **live publication**. An explicit
repository variable `PIPELINE_MODE=shadow` withholds the new dataset (but still
commits resolver state and deploys the frontend). `pipeline:shadow` also withholds
the dataset. If all enabled sources fail, the scrape fails before merging; a
failed scrape or build stops deployment. A single failed source can use retained
observations within their existing freshness limit. The manual `skip_scrape`
option deploys the committed dataset as-is.

### Decision model research and evaluation

The initial candidate is **Cloudflare Clef-flash**, a native decision model
returning choices/probability distributions rather than generated prose.
First-party prices checked on 15 October 2026:

| Adapter / model | USD per million input tokens | Output charge |
|---|---:|---|
| [Cloudflare Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/) | 0.038 | None |
| [TypeSafe Jev](https://typesafe.ai/) | 0.042 | Input-based pricing |
| [OpenAI Decisions / GPT-6 Luna](https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability) | 0.10 | None |
| [Cloudflare Clef](https://developers.cloudflare.com/workers-ai/models/clef/) | 0.24 | None |

Cloudflare reports stronger results than Jev on several benchmarks, but also
reports tasks where Jev wins. These are vendor measurements, not evidence that
Clef-flash is best for cinema identity resolution. See the
[release benchmarks](https://blog.cloudflare.com/clef-decision-models/).
Perplexity's [open-weight decider](https://huggingface.co/perplexity-ai/pplx-decider-v1.1-27b)
also reports gains over Jev, but its published serving instructions require a
large CUDA GPU. Its model card does not establish a cheap hosted endpoint, so it
was not selected for this small deployment. Rankings do not replace task-specific tests.

The three HTTP adapters share one bounded decision interface. Switching provider
does not change extraction or identity rules. No stronger-model escalation is
implemented. Source text is untrusted input; provider output choices and complete
probability distributions are validated.

```bash
npm run pipeline:eval          # deterministic parsing fixtures; no model calls
npm run pipeline:eval -- --live # labeled decision fixtures; requires provider key
npm test                      # source, identity, persistence, review and publication tests
```

`pipeline/evaluation-fixtures.ts` contains source-inspired and synthetic cases,
including held-out comparisons. Reports go to ignored `data/evaluations/` and
separate correctness, accepted decisions, unsafe matches, latency and cost. No
live benchmarking has been performed without credentials. The default 0.97
confidence/probability threshold is provisional; inspect accepted errors and
review rate on representative held-out data before enabling live publication.

The application reserves conservative spend before a call and retains that
reservation after an ambiguous timeout. Completed usage settles the reservation.
Materially unchanged decisions are cached across fresh observation timestamps;
changed evidence, model, question/policy or threshold invalidates the cache.
The default USD 8 monthly allowance leaves room below the requested EUR 10
budget, but does not control unrelated provider-account usage or exchange rates.
An exhausted allowance defers new decisions to review while extraction continues.

### Scraper flags

| Flag | Effect |
|---|---|
| `--force-enrich` | Re-fetch TMDb and OMDb data even if already cached |
| `--skip-berlin-de` | Skip fetching berlin.de; retained observations still follow freshness rules |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TMDB_API_KEY` | For local enrichment | [TMDb API key](https://www.themoviedb.org/settings/api) — metadata, posters, trailers |
| `OMDB_API_KEY` | No | [OMDb API key](https://www.omdbapi.com/apikey.aspx) — IMDb, Rotten Tomatoes, Metacritic ratings |
| `DECISION_PROVIDER` | No | `cloudflare` (default), `typesafe`, or `openai` |
| `DECISION_MODEL` | No | Provider default; see `.env.example` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | For Clef | Workers AI account/token; server-side only |
| `TYPESAFE_API_KEY`, `OPENAI_API_KEY` | For alternatives | Only the selected provider's key is used |
| `DECISION_THRESHOLD` | No | Provisional acceptance threshold, default `0.97` |
| `DECISION_MONTHLY_USD_LIMIT` | No | Application allowance, default `8` |
| `ADMIN_PORT` | No | Local review port, default `3003` |

## Releases and hosting

Git holds code only. Pipeline state, the published dataset, the sitemap and the audit live on an always-on Linux server under `$OVB_ROOT` (default `~/ovberlin`). `ops/server/install.sh` sets it up and installs runner updates.

| Flow | What happens |
|---|---|
| Push to `main` | GitHub Actions runs checks. Within five minutes the server serves a staging build of `main` with production data on port 4174, on its private network. Staging never touches production. |
| `npm run release` (`-- minor`) | Tags `main` as `v*`. The server deploys the newest tag within five minutes, then refreshes every six hours: back up state, scrape, build, upload `dist/` to the `site-live` release and run *Publish site* (GitHub Pages). Nothing is committed. |
| `npm run staging:scrape` | Scrapes with `main` against a copy of production state (needs an SSH host alias `ovberlin`). |
| Review UI | Runs on the server, reachable only on its private network over HTTPS (port 3443). A correction rebuilds and publishes the site within minutes, without scraping. |

On the server: logs with `journalctl --user -u ovberlin-prod` (or `-staging`, `-poll`), run now with `systemctl --user start ovberlin-prod`, and the last 20 pre-run states are in `$OVB_ROOT/backups`. In `$OVB_ROOT/secrets.env`, `NOTIFY_URL` gets a JSON POST when a run fails and `ADMIN_ORIGINS` lists the proxy origins the review server accepts.

## Public data audit

The read-only audit workspace is at `/admin` locally and at `/admin/` after the
next deployment. It is intentionally public and exposes only public listing
data and sanitized matching evidence. It has no editing or scrape-trigger API.

- **Latest changes** (`/admin`) shows only changes in the last run compared with
  the preceding run. An unchanged run has no listed changes; a baseline has no
  predecessor and is not presented as newly added data.
- **Cinemas** (`/admin/cinemas`) and **Movies** (`/admin/movies`) have separate lists. Open a record
  for its details, source observations, viewings, and individual value histories
  with dated before/after values. Retired records and viewings remain inspectable.
  Related matching/API evidence includes retained legacy decisions, identity
  links, bounded model decisions, external identity groups, TMDb candidates,
  and cache/fallback decisions, when captured by the pipeline.
- **Versions / Tags** (`/admin/versions`) groups equivalent explicit labels with
  the same parser used by the resolver. It shows meanings, raw source labels,
  confirmed and source-only viewing counts, and related viewings. `OF`/`OV` and
  `OmenglU`/`OmeU` share canonical entries; generic `OmU` stays distinct from
  explicit English subtitles. Language, projection, edition and event tags remain
  separate dimensions. Unknown markers and conflicting descriptions are retained
  without being promoted to confirmed tags, and a viewing counts once per tag.

`npm run audit:seed` initializes a baseline from the existing movie snapshot if
tracking has not started. Build and local startup run this automatically.
Baseline records predate tracking: their true creation and change dates are
unknown. Historical Git snapshots have not been backfilled. An imported
published dataset cannot reconstruct the original extraction or API search
decisions; those are labeled unavailable rather than inferred from a URL.

Each full scrape writes `public/audit/index.json` and an immutable report in
`public/audit/runs/`. The server keeps these alongside the movie
data, including failed-refresh reports, so history survives deployments.
Do not delete these files to refresh data. Run a single scraper/writer at a time.
No database is needed: the server's state file is the durable store and scheduled
writer, its review UI writes corrections, and Pages serves static files. A per-record report index lets
the browser fetch only relevant history rather than every historical run.
Builds upgrade older indexes from their existing reports without inventing
events. No automatic retention policy is applied. For a much larger archive,
the static index and reports can be partitioned while retaining this architecture.

A screening is one movie/cinema/date/time slot with all its format variants.
"No longer listed" means absent from the latest output, not a cancellation.
Cached observations retain their extraction timestamp; repeated observations
do not count as content updates. Re-importing identical published data does not
create a synthetic refresh. Failed refreshes preserve the last successful audit
entity snapshot.

## Verification

Run `npm run verify -- discover` for offline scenarios and source-bound evidence.
See [the verification guide](verification.md) for commands, controls and limits.

