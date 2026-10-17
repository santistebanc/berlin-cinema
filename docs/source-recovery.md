# Scoped refreshes and operation recovery

The pipeline keeps usable records from partial acquisition. It withdraws omitted
screening support only inside validated complete coverage for the same source
instance, cinema record IDs, inclusive date range and conjunctive collection
filters. Array filter values are alternatives. Unknown filter membership never
proves that an observation is in a completed partition.
Incomplete partitions use a separate conservative overlap check: missing, empty
or invalid dimensions cannot prove exclusion. Variant alternatives must all be
nonempty strings; arrays containing invalid elements and boolean variants remain
unknown even on rejected rows. A failed filtered partition therefore protects
retained support with unknown variant membership from an overlapping complete one.

## Adapter completeness and failures

Declare each independently checked partition in `collection.coverage`. Use
`complete` only after pagination and extraction finish. An empty partition also
requires `emptyProgrammeConfirmed: true`; zero extracted rows alone cannot
establish an empty programme. Existing website adapters reject unsupported empty
pages. Native adapters can confirm empty programmes from an explicit upstream
signal. `partial`, `failed` and `unknown` coverage cannot withdraw support and
veto withdrawal where they overlap a complete partition.

Malformed records, conflicting record IDs, missing relationships and invalid
coverage downgrade only partitions they may affect. Missing scope dimensions
are treated conservatively. A failed page/request diagnostic should supply
`scope` with the coverage dimensions (`cinemaRecordIds`, `dateRange`, `filters`)
and use code `page-failed` or `request-failed`. Unknown acquisition-failure scope
blocks withdrawal across the collection; a successful retry (`request-retry`)
does not. Optional film/venue detail failures do not imply listing incompleteness.

The default website adapters report partially unparsed entries, dates and time
cells as `extraction-incomplete`, retaining supported sibling screenings. Their
coverage is unbounded, so extraction uncertainty makes that declaration partial;
surviving rows alone cannot prove that the page was fully extracted.
Time extraction accounts for the entire cell, including mixed supported and
unsupported fragments. Colon-separated hours/minutes support one- or two-digit
hours; supported tokens use commas or whitespace as separators, and Berlin tokens
may carry parenthesized source variants. Out-of-range times and any remaining
unsupported text produce a diagnostic and partial coverage. For example,
`20:00 (OV), 19.30 (OV)` retains 20:00, diagnoses the unsupported fragment and
cannot withdraw an earlier 19:30 observation. Dot-separated times are not guessed.

Valid sibling partitions remain independently usable. Omission is not a
cancellation. Listing/venue heads can retire only when omitted and orphaned by
withdrawn screenings; any remaining active screening protects its shared parent
evidence, including support outside the refreshed scope. Observation history,
aliases, corrections and verified identities remain available after withdrawal.

Latest coverage is retained in `source-coverage:<source>:<dimensions hash>`;
`source-coverage-history:` retains distinct timestamped declarations. Replay
cannot overwrite newer completed coverage or revive withdrawn screening support.
Recollection can restore support with an actual new observation. Cached records
and optional details keep original observation/fetch timestamps.

## Request budgets

Instance `limits` accepts `attempts` (1–5, default 3), `requestTimeoutMs`
(default 20000) and `collectionTimeoutMs` (default 120000), in addition to
`requests`, `filmDetails` and `venueDetails`. Every retry spends the same
instance request budget. Retryable HTTP statuses are 408, 425, 429, 500, 502, 503
and 504; transient reset, DNS and timeout errors also retry. The existing film
307 retry remains supported. Permanent HTTP failures and persistence failures
are not retried. Retry-After delays are capped at 60 seconds; the collection
deadline still bounds the source. Transport is aborted on timeout and other
sources continue independently. HTTPS/URL allowlists and redirect rules remain.

Adapters can call injected `progress(collection)` after extracting usable pages
and before optional work. The registry owns a copy of the latest fresh handoff.
If subsequent acquisition reaches its deadline or fails, it returns that progress
as fresh partial acquisition with `collection-incomplete` diagnostics, rather than
substituting old cache or empty failure. Every coverage declaration becomes partial
and loses confirmed-empty authority. The listing's original observation/fetch times
and any already collected detail timestamps remain unchanged. Default adapters
hand off before optional lookups, after individual detail results and between Berlin
pages. Late work cannot mutate the returned snapshot or write through an aborted
context. Persistence failures still propagate instead of recovering partial success.

## Structured outcomes and operator actions

`runPipelineResult(options)` returns `{schemaVersion: 1, outcome, snapshot,
diagnostics}`. The compatible `runPipeline` returns a snapshot on success and
throws `PipelineRunFailure` with `.result` on operation failure. `operation` is
`acquisition`, deliberate retained `replay`, or local `recalculate`.

| Outcome | Meaning | Operator action |
| --- | --- | --- |
| `published` | Valid inputs processed successfully | No recovery needed |
| `degraded` | Usable data processed with partial/cached inputs or optional outages | Inspect source/scope and fallback; retry only the affected dependency |
| `preserved-acquisition-failure` | No fresh usable screenings or validated confirmed empty coverage | Previous publication stays unchanged; restore acquisition and retry |
| `fatal` | Processing, persistence, migration, writer-lock or publication failed | Repair the error; retain durable state and the previous public dataset |

With `publish: false` these success outcomes describe the processed shadow
snapshot; no public files are replaced. Deliberate replay is not fresh
acquisition and cannot renew freshness. Do not turn an acquisition outage into
an implicit successful replay.

`npm run scrape` and merge/replay CLI commands print structured diagnostics and
exit nonzero for acquisition/fatal failures. Diagnostics identify stage, source,
record/scope where known, reason, retryability and current fallback. Secrets are
redacted. The store retains `pipeline:last-outcome`, `source-attempt:<source>`
and `source-validation:<source>` independently of public publication. Open
`npm run admin` at `http://127.0.0.1:3003/admin/review` and expand **Refresh
diagnostics**, then **Source attempts and coverage**. The same information is
returned by local `GET /api/review/state` under `operations`.

Optional metadata, ratings, model and geocoding outages keep eligible retained
evidence or source-only fields. They cannot establish missing facts, overwrite
corrections, merge protected identities or bypass verified Berlin location
requirements. Unverified locations remain excluded. Operational notices are
distinct from an identity decision requiring a reviewer.

Persistence corruption or an incompatible state version is an explicit error.
Never delete/replace state to make the run succeed. Keep a backup, repair the
state/migration and retry. A live writer owns its lock until it finishes; do not
remove its lock. Publication rollback restores the previous snapshot and public
files if dataset/audit writing fails. Diagnostics are then saved separately when
the store is writable. If persistence itself cannot be written, the explicit
error is the recovery signal; no empty store is substituted.

Publication resolves an explicit `publicationRoot` before `PIPELINE_PUBLIC_ROOT`,
then defaults to the checkout. Dataset, sitemap, success/failure audit history and
rollback all use that selected root's `public/` directory. Failure auditing appends
only when that root already has an audit history, preserving the last successful
dataset and immutable audit runs. With neither override, production paths stay
unchanged.

## Public loading and expiry

`programmeStatus` distinguishes `available`, checked `empty` and
`no-current-support`. Legacy snapshots without it remain readable. The browser
validates the snapshot before freshness processing and reports malformed data
separately from a transport failure through `loadMovieData.loadState`.

Failed reloads preserve still-eligible previous movies and show a retry banner.
They retain the original `scrapedAt`/`lastObservedAt`; they never create new
support. Screenings become stale after seven hours and expire after 24 hours,
and showtime/date comparisons use Europe/Berlin. Expiry is reapplied on every
load/reload and each minute while the page remains open, including PWA/cache
snapshots. Old empty programmes also expire. The UI shows distinct checked-empty,
expired-support and unavailable messages; existing movies remain visible during
a reload. The layout, route identities and review controls are unchanged.

## Offline verification

Use WSL Node 24/npm with an isolated checkout and captured fixtures. All new
suites are included in `npm test` through `test:pipeline`:

```sh
npm run test:resilience
npm run test:contracts
npm run test:sources
npm test
npm run typecheck
```

`test:resilience` covers cinema/day isolation, overlapping filters, invalid
siblings, failed-page scope, retained timestamps, confirmed/unexpected empty
programmes, provider failures, bounded retries/deadlines, operation outcomes and
local admin diagnostics. Existing pipeline/review/publication tests protect
identity continuity, corrections, verified locations, locks and rollback.
Public-consumption tests cover malformed/transport reloads, eligible fallbacks,
expiry, legacy/PWA snapshots and Berlin date boundaries. No live scraping,
provider spending or deployment is needed to run these tests.
