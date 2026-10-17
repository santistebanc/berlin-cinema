# Configured source adapters

Normal scraping, retained-data merge/replay and optional source-detail recovery
use `SourceRegistry` (`api/sources/registry.ts`). `SourceAdapter` and the runtime
validated `SourceInstance` configuration are in `api/sources/types.ts`. Collection
records use the [shared source contracts](source-contracts.md).

## Configuration and commands

The composition in `api/sources/defaults.ts` registers critic.de and berlin.de.
Each instance has a stable `id`, reusable `adapterId`, `enabled` flag, independent
`cacheIdentity`, adapter `config`, and request/detail limits. Do not rename an
existing instance when changing its configuration: its ID namespaces retained
observations, aliases and corrections. The registry rejects duplicate instance
and cache identities and invalid configuration.

Set `SOURCE_DISABLED=berlin.de` (comma-separated IDs) to disable collection and
network detail lookups for an instance. Historical evidence and corrections stay
in the pipeline store, and the existing 24-hour screening freshness rule applies.
Cached optional details remain available. `--skip-berlin-de` remains supported.
`npm run scrape -- --sources=critic.de` selects instances for that run. Unselected
instances contribute eligible historical evidence without fresh collection.

`SOURCE_INSTANCES_FILE` optionally names a JSON array replacing the default
instances. For example, an instance has this shape:

```json
{
  "id": "critic.de",
  "adapterId": "critic.de",
  "enabled": true,
  "cacheIdentity": "critic",
  "legacyCache": true,
  "retainedFile": "critic-raw.json",
  "config": {},
  "limits": { "requests": 300, "filmDetails": 40, "venueDetails": 100 }
}
```

Keep `legacyCache` only for the original instances: it preserves existing
URL-keyed detail resources. New instances omit it and get separate cache keys.
`retainedFile` is a basename under `data/`; its default derives from cache identity.
The original `critic-raw.json` and `berlin-raw.json` names remain compatible. Their
old `{movies, scrapedAt, complete}` contents are read by adapter compatibility
code; new writes contain versioned `SourceCollection` envelopes. Replaying either
format keeps original record keys and observation/fetch timestamps.

`npm run scrape` collects enabled instances and passes their typed collections
directly to merge/publication. Each standalone `scripts/scrape-*-de.ts` command
only collects its registered source. `pipeline:replay` and `pipeline:shadow` load
retained collections through the registry before recalculating. `--offline`
prevents source and enrichment requests; `--shadow` withholds publication;
`--force-enrich` refreshes optional evidence/enrichment. Local review recalculation
uses the same adapter detail dispatch without starting a listing scrape.

## Implementing an adapter

Implement `collect(instance, dependencies): Promise<SourceCollection>`, declare
`capabilities` and an extraction version, and provide an `allows` predicate for
each request purpose. Keep listing requests, pagination and interpretation with
the adapter. Optional `film` and `venue` extractors allow shared bounded detail
collection and replay recovery. These extractors only report attributed source
facts; they do not resolve canonical identities or apply corrections.

Dependencies supply request transport, cache, clock, diagnostics and optional
retry waiting. The registry enforces HTTPS, credentials restrictions, the
adapter's URL allowlist and the instance request budget for collection contexts.
Detail refreshes enforce request and lookup limits too. The default transport
has timeouts, response-size limits and no implicit redirects. Film retries use
the original URL; venue redirects must stay on the same origin and venue path,
with at most three redirects. Existing failed/successful detail cache TTLs remain.

Return stable upstream IDs and original labels. A screenings-only adapter still
supplies the minimum listing and venue records its screenings reference; optional
credits, posters, ratings and canonical/display fields can be absent. Do not
manufacture metadata. Return partial coverage when pages fail or pagination is
incomplete. Only explicit, supported empty programmes may claim confirmed
emptiness. Failed refresh fallback is `cached`, preserves timestamps and cannot
claim a completed refresh. Persistence errors remain fatal operation errors.

Register the implementation and instances at composition, then pass the registry
to `scrape({registry, dependencies})` or `runPipeline({sourceRegistry,
sourceDependencies, collections, ...})`. Shared orchestration, resolution and React
need no new source branch. `api/sources/fixtures/cinema.ts` is a fixture-only
example emitting native records, exercised as two configured cinema instances.
It is deliberately absent from production defaults.

## Verification and follow-on work

`npm run test:sources` tests captured critic.de/berlin.de pages through collection
and public snapshots, native third-source/two-instance publication, selection,
disable/re-enable continuity, cache times, bounded requests, partial pages,
legacy raw replay, and adapter-dispatched local detail recovery. `npm test`
includes these checks and existing migration, correction, review, publication
recovery and identity suites. No live collection or paid provider is required.

Scoped support withdrawal and structured run outcomes remain ticket #5.
Field authority, lineage ranking and review policy remain ticket #6. This
structural migration retains the current identity and website-evidence rules.
