# Source ingestion contracts (expand step)

`shared/contracts.ts` exports browser-safe Zod runtime schemas and inferred types.
Source contract version 1 is separate from public snapshot version 2 and retained
pipeline state version 1. No persisted identity migration is needed for this step.

`runPipeline({ collections, ...dependencies })` accepts `SourceCollection[]`.
The legacy `batches` option remains supported and passes through
`translateLegacyBatch` before the same validation/ingestion boundary. The
translator is outside canonical identity resolution. Validation results are
returned as `snapshot.ingestion` and retained in
`source-validation:<sourceInstanceId>` resources, including sanitized rejected
evidence and diagnostics. Unexpected processing and persistence errors still throw.

Each collection declares its source instance, adapter, extraction version,
observation time, status, records, coverage and diagnostics. Records discriminate
listing, venue and screening data. A listing can describe a film or programme;
the existing label interpretation determines canonical identity. Screening
relationships use `listingRecordId` and `venueRecordId` within the same collection.
Record IDs are stable within a kind/source instance. Provenance repeats that
identity and retains the original label, source URL, extraction version, actual
observation/fetch times and known upstream lineage. Empty lineage means unknown.

`fields` distinguishes known values, unknown values, explicit absence, retrieval
failure, and manual clearing with a correction reference. Legacy null/missing
values become unknown, never absence. Source field states retain evidence; they
do not create canonical human overrides or bypass existing correction policy.
Optional invalid fields are removed from resolution input and diagnosed. Invalid
records/references prevent safe withdrawal while valid siblings still contribute.
Records may omit optional metadata. Current validated scraper extensions are
retained during this expansion.

Coverage declares source instance, cinema record IDs, optional date range,
filters, completeness, and explicit confirmation of empty programmes. Until
ticket #5 implements scoped reconciliation, only validated complete whole-source
coverage performs the existing whole-source retirement. Scoped coverage is
retained without a source-wide retirement. Validation failures conservatively
mark complete coverage partial. Omission never means cancellation.

Legacy source keys, source subjects, observation hashes, aliases and resolver
inputs remain stable. Provenance and field-state sidecars do not enter legacy
identity fingerprints. Published aliases and screenings expose provenance;
detail recalculation retains listing/venue provenance without renewing freshness.

Public snapshot validation runs before pipeline output/publication and browser
freshness processing. Historical unversioned/v1 snapshots remain readable, as
does current v2. A valid empty dataset succeeds. `loadMovieData` preserves eligible
previous data after a failed reload and reapplies expiry using original timestamps.
The React movie provider uses that boundary. This step does not change existing
identity, location verification, enrichment or field-selection policy.

Run `npm run test:contracts`, `npm run test:pipeline`, `npm test` and
`npm run typecheck`. Tests use the approved pipeline, compatibility/collection,
publication and public-consumption boundaries with fixed clocks, fixtures and
isolated state. No production scraper or provider calls are needed.
