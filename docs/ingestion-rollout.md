# Ingestion migration and rollout

The operational entry point is the configured `SourceRegistry`. Scheduled scrape,
retained replay, local admin recalculation and static publication all consume its
versioned collections. `runPipeline` no longer accepts temporary `batches` input.
Unused scraper facades and parser forwarding exports have been removed. Explicit
legacy raw translation, URL-keyed detail cache readers and historical public/PWA
snapshot readers remain supported.

## Prepare, migrate and recover

Stop acquisition, admin jobs and other writers first. A migration refuses an
existing state writer lock; do not remove an active lock. Keep the current code
revision, state, raw files, public JSON, sitemap and audit together before changing
operational paths. The command below copies its inputs; it never overwrites them.
Use Node 24/npm in WSL and Windows Git for this repository's worktree metadata.

```sh
npm run pipeline:inventory -- /isolated/input/state.json
npm run pipeline:migrate -- \
  --state /isolated/input/state.json \
  --data /isolated/input/data \
  --output /isolated/rollout-v2
```

`--output` must be a new directory. The result contains `state.json.gz`, `data/`,
`original/state.json` (or `original/state.json.gz` for compressed input),
`original/data/` and `manifest.json`. The manifest records
input/output encoded-byte SHA-256 values, configuration hash, missing configured raw files,
unconfigured raw files and retained validation diagnostics. Extra unconfigured
JSON files are copied byte-for-byte and archived, without activating a source or
claiming their contents were validated. Other files/directories remain in the
untouched input directory. Missing raw files are reported, not reconstructed from
invented observations. Existing store observations still remain available.

State v1 becomes v2 by adding provenance/field-state sidecars. Observation IDs,
fingerprints, data, first fetch times, head activity/last observation/withdrawal
times, source subjects, aliases, entities, IDs/slugs, corrections, verified fields,
provider caches, snapshots and review history are retained. An unchanged historical
observation ID can have a later last-observed head: its new attribution uses that
original head time, without changing the original observation. Unknown upstream
lineage remains `[]`. Null historical source fields become unknown, not absence.
An existing v2 state migrates without another identity or timestamp change.

Old `{movies,scrapedAt,complete}` caches become source collection v1 through the
configured adapter's historical reader. Typed v1 caches remain readable. Migrated
raw envelopes are cached/partial: replay cannot establish a fresh completed
refresh or revive withdrawn support. Original record timestamps, labels, stable
keys, optional detail fetch times, rejected sibling evidence and diagnostics stay
available. Unsupported versions, malformed envelopes, corrupt state references
and input changes during preparation fail before publishing the output bundle.
The original state/raw/publication remain available for recovery. Native malformed
individual source records stay at ingestion's isolation boundary rather than
being silently discarded by migration.

Repeating exactly the same migration into the same untouched output verifies the
manifest and all file checksums and returns the same result. Different inputs,
configuration or modified output require a new output directory. Preparation uses
a uniquely named staging directory and an atomic directory rename; interrupted
preparation cannot become the operational bundle. A killed process may leave its
named `.staging` directory: inspect and remove only that staging directory after
confirming no migration process is running. Never remove a state writer's lock.

Recovery verifies the originals' checksums and copies them into another new
directory:

```sh
npm run pipeline:migrate -- --restore /isolated/rollout-v2 --output /isolated/recovered-v1
```

Use the original code revision to operate restored v1 state. Compressed originals
restore as gzip; code predating compression needs a decoded copy in a separate
directory, retaining the original encoded backup and checksum manifest. Current code can read
v1 for inspection/development, but refuses writer leases with migration guidance.
Do not substitute a blank store to recover an error: that loses accepted identities,
corrections and verified provenance. If a bundle has already been used by writers,
its output state will differ from the preparation checksum; recovery still verifies
and restores the immutable `original/` backup. Keep that directory and manifest.

## Controlled comparison and activation

Create a **separate detached** baseline worktree at original commit
`1641dedd018422721b53d22e767598da0e1e60d2` using Windows Git. Give it Node 24
dependencies. The comparison checks the actual baseline HEAD and refuses tracked
baseline changes. It does not compare against the integration branch as a proxy.

```sh
npm run pipeline:compare -- \
  --baseline-root /path/to/detached-original-base \
  --state /isolated/input/state-v1.json \
  --data /isolated/input/original-raw \
  --output /isolated/comparison \
  --now 2026-10-16T07:08:38.647Z
```

This requires original v1 state and original legacy raw files, such as those in a
migration bundle's `original/`. Both implementations run against independent
temporary copies with fixed clocks, retained provider/geocoder evidence, model
disabled, network disabled, audit disabled and publication disabled. The actual
old scraper facades and current default adapters also receive the same captured
HTTP responses; the old parser's global clock is fixed while extracting them.
Both checkouts' Axios module instances receive the captured transport, including
when their dependency installations differ. A process-local HTTP/HTTPS/fetch guard
rejects accidental live requests throughout the comparison. A final two-day
expiry scenario proves raw replay does not renew support.

`comparison.json` and before/after snapshots retain every compared difference:
public IDs/slugs/routes, source alias subjects, field values, regrouping, viewing
keys/details, venue fields, freshness, review counts and resolution metrics. Inspect
these files, not only movie counts. Missing public identity/route/alias continuity
or unexplained viewing/identity changes block activation. Expected field-policy,
scope and diagnostic changes need an evidence-based explanation. The command
exits with status 2 when retained-state identity/route/alias/viewing continuity
changes; `rolloutGate` records these blockers separately from behavior differences
which still need review. The separate
cold-raw scenario deliberately removes established identities and verified selected
fields while retaining actual provider caches; it exposes the limitations of a
destructive cold rebuild and is **not** an alternative migration strategy.

After inspecting the comparison, select the migrated paths explicitly:

```sh
export PIPELINE_STATE=/isolated/rollout-v2/state.json.gz
export PIPELINE_DATA_DIR=/isolated/rollout-v2/data
export PIPELINE_PUBLIC_ROOT=/isolated/publication-copy
npm run pipeline:shadow -- --offline --now 2026-10-16T07:08:38.647Z
```

Shadow processing writes only the selected isolated evidence store, including
diagnostics and selected outcomes; it is not a read-only store operation. It does
not replace public files. Use a fresh migration/copy for each independent shadow.
`PIPELINE_PUBLIC_ROOT` contains `public/movies.json`, sitemap and publication files.
Keep a copy of the previous public/audit dataset there for rollback verification.
Normal retained publication uses the same paths with `pipeline:replay -- --offline`.
Live collection remains an explicit `npm run scrape` operation, using the registry;
offline verification never requires live acquisition or provider spending.

Scheduled workflow preparation explicitly creates an isolated migration bundle,
uploads its original evidence/manifest as a seven-day recovery artifact, and
collects against the migrated paths. Only the successfully processed state is
exported losslessly as `pipeline/state.json.gz` into the checkout for the artifact
commit. The workflow removes/stages any obsolete tracked plain state only after
verifying the compressed replacement. The next checkout uses that same gzip file;
repeated migrations remain lossless. See [state format and recovery](source-recovery.md#retained-state-files). `PIPELINE_MODE=shadow`
continues withholding public replacement. No workflow was run or deployed as part
of this verification. A real rollout still requires retaining the recovery artifact,
reviewing the comparison and deliberately enabling the intended publication mode.

On fatal processing/publication failure, preserve the previous public files and
snapshot, repair the dependency/storage condition and retry against the retained
state. Restore originals plus the prior code/public files when rolling back the
architecture itself. Diagnostic/state writes remain explicit failures; no blank
replacement is created. See [operation recovery](source-recovery.md).

## Adding/configuring a source

Implement `SourceAdapter` with reusable `adapterId`, extraction version,
capabilities, URL allowlist and `collect(instance, dependencies)`. Optional film
and venue extractors stay in the adapter. Requests, clock, cache, retry diagnostics
and request/detail budgets come from its supplied dependencies. Test collection
against captured responses. Return stable upstream record IDs, original labels,
relationships and actual observation/fetch timestamps. Declare known upstream
feeds only with evidence; instance IDs/hostnames are not proof of independence.

Register the implementation in `api/sources/defaults.ts` and configure stable
instances using `SOURCE_INSTANCES_FILE`. One adapter can serve multiple cinema
instances, each with its own stable `id`, `cacheIdentity`, config and limits.
Do not rename an instance to replace its provider; preserve historical identities
and aliases deliberately. Newly configured instances omit `legacyCache`; only the
two original instances retain their historical URL-keyed resources. Disabling with
`SOURCE_DISABLED`, `enabled: false` or the supported CLI selection stops collection
and network detail lookups while preserving evidence/corrections and normal expiry.
The scheduled job accepts the same `SOURCE_DISABLED` and `SOURCE_INSTANCES_FILE`
repository variables. Configuration changes must be the same for migration and
collection.

Coverage must identify the instance, cinema IDs, inclusive dates and filters
actually checked. Complete coverage requires successful extraction/pagination;
checked-empty also needs explicit confirmation. Partial pages, failed scopes,
invalid siblings and unknown filter membership cannot imply withdrawal or
cancellation. Describe failures with scope, stage, reason, retryability and
fallback. Registry selection is the only operational source-selection mechanism;
there are no new branches in canonical resolution or React for a new source.
Details and examples: [adapters](source-adapters.md), [contracts](source-contracts.md).

## Verified evidence and limitations

The committed [comparison baseline](ingestion-rollout-baseline.json) and
[observations](ingestion-rollout-observations.md) record the original-base run,
input hashes, actual unknown-lineage behavior, intentional field differences and
workload metrics. `npm run test:rollout` adds representative-state migration,
recovery and combined collection/review/publication acceptance to `npm test`.
All earlier pipeline, adapter, public-data and review tests remain enabled.

These are offline rollout checks, not a claim that every real upstream page is
supported, that the retained input is correct, or that production identity
precision has been measured. No new live cinema scraper is selected here.
