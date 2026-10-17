import assert from 'assert/strict';
import { scrape, publishesInMode } from './scrape';
import type { MergeOptions } from './merge';
import { SourceRegistry } from '../api/sources/registry';
import type { SourceAdapter, SourceDependencies } from '../api/sources/types';
import { translateLegacyBatch } from '../api/pipeline/observations';
import type { SourceCollection } from '../shared/contracts';
import { runPipeline } from '../api/pipeline/pipeline';
import { PipelineStore } from '../api/pipeline/store';

async function main() {
  const now = '2026-10-15T10:00:00Z';
  const adapter: SourceAdapter = { id: 'fixture', extractionVersion: '1', capabilities: ['screenings'],
    allows: url => url.origin === 'https://fixture.test',
    async collect(instance, deps) {
      const response = await deps.request({ url: `https://fixture.test/${instance.id}` });
      return translateLegacyBatch({ source: instance.id, observedAt: deps.now(), status: 'fresh', complete: true,
        movies: JSON.parse(response.body) }) as SourceCollection;
    } };
  const instances = ['critic.de', 'berlin.de', 'third-cinema'].map(id => ({ id, adapterId: 'fixture', enabled: true,
    cacheIdentity: id, config: {}, limits: { requests: 1, filmDetails: 0, venueDetails: 0 } }));
  const registry = new SourceRegistry([adapter], instances);
  const cache = new Map<string, any>();
  const deps: SourceDependencies = { now: () => now, network: true, diagnostic: () => {},
    cache: { get: key => cache.get(key), set: (key, data, fetchedAt) => { cache.set(key, { data, fetchedAt }); } },
    request: async () => ({ status: 200, headers: {}, body: JSON.stringify([{ title: 'Fixture Film', variants: ['OV'],
      cinemas: [{ name: 'Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Cinema', date: '2026-10-16', time: '20:00' }] }]) }) };
  let merged: MergeOptions | undefined; let published: any; let failures = 0;
  const store = new PipelineStore(':memory:');
  const services = { merge: async (options: MergeOptions) => {
    merged = options;
    published = await runPipeline({ store, collections: options.collections, sourceRegistry: registry,
      sourceDependencies: deps, now, network: false, osm: [], model: null, tmdb: null, publish: false, audit: false });
  }, recordFailure: () => { failures++; return undefined as any; } };
  const success = await scrape({ registry, dependencies: deps }, services);
  assert.equal((success as any)?.outcome, 'published', 'A successful acquisition returns a structured publication outcome');
  assert.equal(merged?.publish, true);
  assert.equal(published.total, 1, 'Normal scrape routes all registered collections through publication');
  assert.deepEqual(published.movies[0].sourceAliases.map((alias: any) => alias.source).sort(), ['berlin.de', 'critic.de', 'third-cinema']);
  const id = published.movies[0].id;
  await scrape({ registry, dependencies: deps, publish: false, forceEnrich: true, skipBerlinDe: true }, services);
  assert.equal(merged?.publish, false);
  assert.equal(merged?.forceEnrich, true);
  assert.deepEqual(merged?.sources?.map(source => source.status), ['fresh', 'skipped', 'fresh']);
  assert.equal(published.movies[0].id, id);
  const degraded = await scrape({ registry, dependencies: { ...deps, request: async request => {
    if (request.url.endsWith('critic.de')) throw new Error('Source unavailable');
    return deps.request(request);
  } } }, services);
  assert.equal(degraded.outcome, 'degraded');
  assert.deepEqual(merged?.sources?.map(source => source.status), ['cached', 'fresh', 'fresh']);
  merged = undefined;
  await assert.rejects(scrape({ registry, dependencies: { ...deps, request: async () => { throw new Error('Outage'); } } }, services),
    (error: any) => error.result?.outcome === 'preserved-acquisition-failure' && /No source returned fresh/.test(error.message));
  assert.equal(merged, undefined, 'All-source acquisition failure keeps publication unchanged');
  assert.equal(failures, 1);
  const offline = await scrape({ registry, dependencies: { ...deps, network: false,
    request: async () => { throw new Error('Offline replay cannot request acquisition'); } } }, services);
  assert.equal(offline.outcome, 'degraded', 'Deliberate retained replay is a successful operation with cached evidence');
  const isolated = new PipelineStore(':memory:');
  await assert.rejects(scrape({ registry, dependencies: { ...deps, request: async () => { throw new Error('Outage token=private-secret'); } },
    store: isolated }, services), (error: any) => error.result?.outcome === 'preserved-acquisition-failure');
  const admin = isolated.resource('pipeline:last-outcome')?.data;
  assert.equal(admin?.outcome, 'preserved-acquisition-failure', 'Total acquisition failure remains visible in local admin even though merge is skipped');
  assert.ok(admin.diagnostics.some((diagnostic: any) => diagnostic.stage === 'collection' && diagnostic.fallback));
  assert.equal(JSON.stringify(isolated.resources('source-attempt:')).includes('private-secret'), false);
  await assert.rejects(scrape({ registry, dependencies: { ...deps, network: false }, store: isolated },
    { ...services, merge: async () => { throw new Error('Fixture replay processing failed'); } }),
    (error: any) => error.result?.outcome === 'fatal');
  assert.equal(isolated.resource('pipeline:last-outcome')?.data.operation, 'replay',
    'A failed deliberate replay is still labelled replay in operator diagnostics');
  isolated.close();
  assert.equal(publishesInMode('live'), true);
  assert.equal(publishesInMode('shadow'), false);
  assert.throws(() => publishesInMode('typo'), /Unsupported PIPELINE_MODE/);
  console.log('registered normal scrape publication, skipping, shadow and outage tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
