import assert from 'assert/strict';
import { SourceRegistry } from './registry';
import type { SourceAdapter, SourceDependencies, SourceInstance } from './types';
import { fixtureCinemaAdapter } from './fixtures/cinema';
import { runPipeline } from '../pipeline/pipeline';
import { PipelineStore } from '../pipeline/store';
import type { SourceCollection } from '../../shared/contracts';

const NOW = '2026-10-15T10:00:00Z';
const adapter = fixtureCinemaAdapter;
const instance = (id: string, cinema: string): SourceInstance => ({ id, adapterId: adapter.id, enabled: true,
  cacheIdentity: id, config: { cinema }, limits: { requests: 2, filmDetails: 0, venueDetails: 0 } });
const fixture = (cinema: string) => JSON.stringify({ observedAt: NOW,
  film: { id: 'film-1', title: 'A Film', url: 'https://fixture.test/film/1' },
  cinema: { id: cinema, name: cinema, address: 'Example Street 1, 10115 Berlin' },
  screenings: [{ id: 'session-1', date: '2026-10-16', time: '20:00', variant: 'OV' }] });
const cache = new Map<string, any>();
const deps: SourceDependencies = { now: () => NOW, network: true, diagnostic: () => {},
  cache: { get: key => cache.get(key), set: (key, data, fetchedAt) => { cache.set(key, { data, fetchedAt }); } },
  request: async request => ({ body: fixture(request.url.endsWith('/a') ? 'Cinema A' : 'Cinema B'), status: 200, headers: {} }),
};
const execute = (store: PipelineStore, registry: SourceRegistry, collections: SourceCollection[]) => runPipeline({ store, collections,
  sourceRegistry: registry, sourceDependencies: deps, now: NOW, network: false, model: null, tmdb: null,
  osm: ['Cinema A', 'Cinema B'].map((name, i) => ({ id: `node/${i}`, name, address: 'Example Street 1', insideBerlin: true, website: 'https://cinema.example/' })),
  publish: false, audit: false });

async function main() {
  const instances = [instance('cinema-a', 'a'), instance('cinema-b', 'b')];
  const registry = new SourceRegistry([adapter], instances);
  const collections = await registry.collect(deps);
  assert.deepEqual(collections.map(value => value.sourceInstanceId), ['cinema-a', 'cinema-b']);
  const store = new PipelineStore(':memory:');
  const first = await execute(store, registry, collections);
  assert.equal(first.total, 1, 'A third screenings-only adapter reaches publication without optional metadata');
  assert.equal(first.movies[0].cinemas.length, 2, 'One adapter supports two configured cinemas');
  store.addOverride({ subject: `entity:${first.movies[0].id}`, action: 'patch', patch: { fields: { plot: 'Reviewed plot' } },
    actor: 'fixture', reason: 'Reviewed correction', evidenceFingerprint: 'fixture' });
  const disabled = new SourceRegistry([adapter], instances.map(item => ({ ...item, enabled: false })));
  const paused = await execute(store, disabled, await disabled.collect(deps));
  assert.equal(paused.movies[0].id, first.movies[0].id, 'Disabling collection retains eligible historical identity');
  assert.equal(paused.movies[0].plot, 'Reviewed plot');
  assert.equal(paused.movies[0].slug, first.movies[0].slug);
  const resumed = await execute(store, registry, await registry.collect(deps));
  assert.equal(resumed.movies[0].id, first.movies[0].id);
  assert.equal(resumed.movies[0].plot, 'Reviewed plot');
  assert.deepEqual((await registry.collect(deps, { selected: ['cinema-a'] })).map(item => item.status), ['fresh', 'skipped']);
  const detailedAdapter: SourceAdapter = { ...adapter, capabilities: ['screenings', 'film-details'],
    film: { accepts: url => url.origin === 'https://fixture.test', extract: () => ({ fields: {}, creditsChecked: false }) } };
  const detailRegistry = new SourceRegistry([detailedAdapter], instances);
  cache.set('cinema-a:source-detail:https://fixture.test/film/1', { fetchedAt: NOW, data: {
    url: 'https://fixture.test/film/1', fetchedAt: NOW, parserVersion: 5, creditsChecked: true, fields: { director: 'Cached Director' } } });
  const replayed = await execute(store, detailRegistry, []);
  assert.equal(replayed.movies[0].director, 'Cached Director', 'Local recalculation dispatches optional details through the configured adapter');
  assert.equal(replayed.movies[0].sourceAliases[0].provenance.observedAt, NOW, 'Detail refresh cannot renew listing freshness');
  const offline = { ...deps, network: false, now: () => '2026-10-15T11:00:00Z',
    request: async () => { throw new Error('Offline replay must not request a source'); } };
  const retained = await registry.collect(offline, { retained: true });
  assert.deepEqual(retained.map(item => item.status), ['cached', 'cached']);
  assert.equal(retained[0].observedAt, NOW, 'Retained collections keep their acquisition time');
  assert.equal(retained[0].records[0].provenance.observedAt, NOW);
  const failedRefresh = await registry.collect({ ...deps, request: async () => { throw new Error('Fixture outage'); } });
  assert.equal(failedRefresh[0].status, 'cached', 'A failed source retains usable cached records');
  assert.equal(failedRefresh[0].coverage[0].status, 'partial', 'Cached fallback cannot claim a complete refresh');
  assert.ok(failedRefresh[0].diagnostics.some(item => item.code === 'source-failed'));
  const networkAdapter: SourceAdapter = { ...detailedAdapter,
    film: { accepts: url => url.origin === 'https://fixture.test', extract: body => ({ fields: JSON.parse(body), creditsChecked: true }) } };
  const networkRegistry = new SourceRegistry([networkAdapter], instances.map(item => ({ ...item, limits: { ...item.limits, requests: 3, filmDetails: 1 } })));
  const isolated = structuredClone(collections);
  for (const collection of isolated) {
    const listing = collection.records.find(item => item.kind === 'listing')!;
    listing.data.url = `https://fixture.test/film/${collection.sourceInstanceId}`;
    listing.fields.url = { state: 'known', value: listing.data.url };
  }
  const fetched = await runPipeline({ store: new PipelineStore(':memory:'), collections: isolated, sourceRegistry: networkRegistry,
    sourceDependencies: { ...deps, request: async () => ({ status: 200, headers: {}, body: '{"director":"Retrieved Director","year":2026}' }) },
    now: NOW, network: true, model: null, tmdb: null, omdbKey: '', osm: [], osmAddresses: [], geocoder: null, publish: false, audit: false });
  assert.equal(fetched.movies[0].director, 'Retrieved Director', 'Equivalent titles from different source instances still trigger the existing detail recovery policy');
  let reachedNetwork = false;
  const limited = new SourceRegistry([adapter], instances.map(item => ({ ...item, limits: { ...item.limits, requests: 0 } })));
  const limitedResult = await limited.collect({ ...deps, cache: { get: () => undefined, set: () => {} },
    request: async request => { reachedNetwork = true; return deps.request(request); } });
  assert.equal(reachedNetwork, false, 'Exhausted request budgets stop at the source interface');
  assert.ok(limitedResult.every(item => item.status === 'failed' && item.message.includes('limit')));
  const emptyProgramme = await registry.collect({ ...deps, request: async request => {
    const raw = JSON.parse(fixture(request.url.endsWith('/a') ? 'Cinema A' : 'Cinema B')); raw.screenings = [];
    return { status: 200, headers: {}, body: JSON.stringify(raw) };
  } });
  assert.ok(emptyProgramme.every(item => item.coverage[0].emptyProgrammeConfirmed));
  const expired = await runPipeline({ store, collections: [], sourceRegistry: disabled, sourceDependencies: offline,
    now: '2026-10-16T11:00:00Z', network: false, model: null, tmdb: null, osm: [], publish: false, audit: false });
  assert.equal(expired.total, 0, 'Disabling collection still lets retained support expire under the existing freshness policy');
  await assert.rejects(registry.collect({ ...deps, cache: { get: () => undefined,
    set: () => { throw new Error('Disk unavailable'); } } }), /Disk unavailable/,
  'Persistence failures must remain explicit operation failures');
  console.log('source registry selection, reusable cinema adapter and pipeline continuity passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
