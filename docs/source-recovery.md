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
Scope checks use the same field-state overrides and per-field schemas as ingestion,
including for rejected records and broken relationships. Raw placeholders cannot
prove exclusion after a known override, failed lookup, unknown, absence or clear.
Malformed dates/times cannot narrow a failure, and an unavailable variant cannot
borrow an obsolete fallback label. Valid known disjoint dimensions still isolate
independent partitions. Diagnostics retain the original rejected evidence.
Source-field validation does not depend on a valid record discriminator: every
scope value must satisfy its defining v1 source-data field schemas. Shared field
names must satisfy all defining contracts; untyped extensions remain unknown for
scope interpretation. Coverage declarations can specify alternative values, but
that does not permit arrays or objects in scalar source fields such as variant,
date, time or venueRecordId. Only declared array fields such as movieVariants can
supply source alternatives. Record extensions cannot turn a rejected record into
a coverage declaration. These checks only constrain the scope read view; original
source records and diagnostics remain unchanged.

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

Invalid collection envelopes produce `rejected-source` ingestion results with
their original rejected evidence. Diagnostic and run metadata readers validate
the envelope before using its fields. Valid sibling sources can still publish;
rejected input cannot authorize withdrawal of retained support. The writer lease
is released after every acquired run, including dependency setup and failures
while saving error diagnostics, so a later valid run can retry the same store.

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

## Retained state files

The canonical checkout artifact is `pipeline/state.json.gz`: one gzip member
containing the complete UTF-8 JSON state, including its schema version. Compression
changes storage only; it does not remove observations, provenance, corrections,
snapshots, diagnostics or audit history, or change validation/retention policy.
Node's built-in zlib reads/writes it without a service, dependency or Git LFS.

All store consumers (app preparation, admin, scrape, replay, cleanup and shadow)
use the same selection: explicit `PIPELINE_STATE` is an exact path with no fallback;
otherwise use the sole existing `pipeline/state.json.gz` or legacy
`pipeline/state.json`. A new empty directory chooses gzip. If both default files
exist, stop with an explicit error: preserve both, inspect their histories and
select the intended one explicitly before recovery. Neither file is assumed newer.
Existing default store readers recheck ambiguity on refresh and reject a changed
selected path; reopen them after conversion instead of reviving the old filename.
Do not leave a stale plain file beside the compressed checkout artifact.
A `.gz` suffix means gzip; other filenames mean plain JSON. A custom
`PIPELINE_STATE=/isolated/custom.json` keeps writing plain JSON. Do not rename
gzip bytes to a plain suffix. Invalid/truncated gzip, malformed JSON and unsupported
schemas fail without substituting an empty store or overwriting the input.
V1 is still readable and read-only until explicit v1-to-v2 migration.

Saves retain the existing writer lock, exclusive temporary file, fsync and atomic
rename. Failed writes preserve the previous file and clean up their temporary
file; operation cleanup releases the lease. Compression completes before file
replacement. Stop all acquisition/admin writers before migration or export.

Scheduled preparation writes `.recovery/scheduled-migration/state.json.gz` and
uploads the manifest plus immutable original bytes. After successful processing,
`npm run pipeline:export-state` exports the explicit `PIPELINE_STATE` into
`pipeline/state.json.gz`. It requires a separate prepared input, locks that input
and both checkout filenames, validates state and the encoded-size limit, atomically
writes/verifies gzip, then removes an obsolete plain file. It leaves the separate
input/recovery bundle intact. A failed rename retains the previous artifact.
Interruption or failure after replacement but before plain-file removal can leave
both files; default discovery then refuses to guess. Preserve the bundle and
rerun the explicit export after all writers stop. An active lock is never removed
by the exporter; investigate an interrupted process before removing its stale lock.
The workflow stages the gzip file and, if tracked, the plain-file deletion.
No newly committed state blob may reach 100 MiB; an oversized compressed export
fails explicitly and keeps the previous artifact.

Inventory and migration accept both suffixes; inventory without an argument uses
the same default/environment selection. Migration without `--state` does too.
Recovery manifests hash the **encoded original bytes** and retain their correct
`original/state.json` or `original/state.json.gz` name. Restoration reproduces those
bytes exactly. Older plain bundles remain checksum-verifiable, repeatable and
restorable. To use a compressed original with code predating gzip support, decode
a copy into a separate directory (`gzip -dc original/state.json.gz > /new/state.json`);
retain the encoded backup and manifest. Never replace a damaged state with a blank
one, or discard either history to resolve a default-path ambiguity.

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
