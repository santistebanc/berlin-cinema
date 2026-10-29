import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PipelineStore } from './store';
import { runPipelineResult, publishWithRollback } from './pipeline';
import { defaultInstances } from '../sources/defaults';
import { criticAdapter } from '../sources/critic';
import { berlinAdapter } from '../sources/berlin';
import { fixtureCinemaAdapter } from '../sources/fixtures/cinema';
import { SourceRegistry } from '../sources/registry';
import type { SourceDependencies } from '../sources/types';
import { applyReview, previewReview } from './review';
import { loadMovieData } from '../../src/services/movie-data';
import { capturedRequest, cinemaResponse, ROLLOUT_NOW as NOW, ROLLOUT_DATE as DATE } from '../../pipeline/rollout-fixtures';
import { migrateIngestion } from '../../scripts/migrate-ingestion';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-rollout-'));
  const store = new PipelineStore(path.join(root, 'state.json'));
  const registry = new SourceRegistry([criticAdapter, berlinAdapter, fixtureCinemaAdapter], [
    ...defaultInstances.map(i => ({ ...i, limits: { ...i.limits, filmDetails: 0, venueDetails: 1 } })),
    ...['a', 'b'].map(cinema => ({ id: `cinema-${cinema}`, adapterId: fixtureCinemaAdapter.id, enabled: true,
      cacheIdentity: `cinema-${cinema}`, config: { cinema }, limits: { requests: 1, filmDetails: 0, venueDetails: 0 } })),
  ]);
  const cache = new Map<string, any>();
  const deps: SourceDependencies = { now: () => NOW, network: true, diagnostic: () => {}, request: capturedRequest,
    cache: { get: key => cache.get(key), set: (key, data, fetchedAt) => { cache.set(key, { data, fetchedAt }); } } };
  const execute = (collections: any[], extra: any = {}) => runPipelineResult({ store, collections,
    sourceRegistry: registry, sourceDependencies: deps, now: NOW, network: false, model: null, tmdb: null,
    osm: [], osmAddresses: [], geocoder: null, audit: false, publish: true, publicationRoot: root, ...extra });
  try {
    const collected = await registry.collect(deps);
    assert.ok(collected.every(c => c.status === 'fresh'));
    assert.ok(collected.every(c => c.records.every(r => JSON.stringify(r.provenance.upstreamLineage)
      === JSON.stringify(registry.adapter(registry.instance(c.sourceInstanceId)!).upstreamLineage ?? []))), 'Actual adapters record their declared origin');
    const first = await execute(collected, { operation: 'acquisition' });
    assert.equal(first.outcome, 'published');
    const movie = first.snapshot.movies[0];
    assert.equal(movie.showings[DATE]['20:00'][0].observationIds.length, 3, 'Three adapters automatically deduplicate one established viewing');
    assert.equal(movie.cinemas.length, 1, 'Unverified second cinema remains excluded');
    const question = store.issues().find(i => i.status === 'open' && i.details.entityId && store.entity(i.details.entityId)?.kind === 'venue')!;
    assert.ok(question, 'Second instance has an actionable location decision');
    const command = { issueId: question.id, action: 'fields' as const, values: { insideBerlin: true, address: 'Second Street 2, 10115 Berlin' },
      revision: store.revision, evidenceFingerprint: question.fingerprint, reason: 'Reviewed captured address evidence' };
    const preview = await previewReview(store, command);
    assert.ok(preview);
    assert.ok(store.acquireLease('review')); store.transaction(() => applyReview(store, command)); store.releaseLease('review');
    const savedCorrections = store.allOverrides();
    assert.equal(savedCorrections.filter(c => c.action === 'link').length, 1, 'A single reviewed venue alias gets one durable link correction');
    const historical = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8')); historical.schemaVersion = 1;
    for (const correction of historical.overrides) if (correction.patch) delete correction.patch.fieldBaseline;
    const historicalFile = path.join(root, 'historical-state.json'); fs.writeFileSync(historicalFile, JSON.stringify(historical));
    const historicalOutput = path.join(root, 'historical-migrated');
    migrateIngestion({ stateFile: historicalFile, dataDir: path.join(root, 'no-raw'), output: historicalOutput, registry });
    const historicalStore = new PipelineStore(path.join(historicalOutput, 'state.json.gz'));
    try {
      const historicalReplay = await runPipelineResult({ store: historicalStore, collections: [], sourceRegistry: registry,
        now: NOW, network: false, model: null, tmdb: null, geocoder: null, osm: [], osmAddresses: [], publish: false, audit: false });
      assert.ok(historicalReplay.snapshot.movies[0].cinemas.some((c: any) => c.address === command.values.address));
      assert.equal(historicalStore.issues().filter(i => i.type === 'correction-conflict' && i.status === 'open').length, 0,
        'Migrated legacy address corrections do not reopen on equivalent blank source evidence');
    } finally { historicalStore.close(); }
    const reviewed = await execute([], { operation: 'recalculate' });
    assert.equal(reviewed.snapshot.movies[0].cinemas.length, 2, 'Review correction makes the second adapter instance publishable');
    assert.equal(reviewed.snapshot.movies[0].id, movie.id); assert.equal(reviewed.snapshot.movies[0].slug, movie.slug);
    const partial = await registry.collect({ ...deps, now: () => '2026-10-15T11:00:00Z', request: async request => {
      if (request.url !== 'https://fixture.test/a') return capturedRequest(request);
      const raw = cinemaResponse('a'); raw.screenings = [{ id: 'session-2', date: DATE, time: '21:00', variant: 'OV' },
        { id: 'malformed', date: 'invalid-date', time: '20:00', variant: 'OV' }];
      return { body: JSON.stringify(raw), status: 200, headers: {} };
    } }, { selected: ['cinema-a'] });
    const degraded = await execute(partial, { operation: 'acquisition', now: '2026-10-15T11:00:00Z',
      tmdb: { candidates: async () => { throw new Error('Offline optional metadata outage'); } } });
    assert.equal(degraded.outcome, 'degraded');
    assert.ok(degraded.snapshot.movies[0].showings[DATE]['21:00']);
    assert.ok(degraded.snapshot.movies[0].showings[DATE]['20:00'].some((s: any) => s.observationIds.length === 3), 'Malformed sibling prevents omission from withdrawing previous third-source support');
    assert.equal(degraded.snapshot.movies[0].cinemas.length, 2, 'Unselected second instance and its correction survive partial refresh');
    assert.ok(degraded.diagnostics.some(d => d.stage === 'metadata'));
    const disabled = registry.withSelection({ disabled: registry.instances.map(i => i.id) });
    const paused = await execute(await disabled.collect(deps), { sourceRegistry: disabled, operation: 'recalculate', now: '2026-10-15T11:30:00Z' });
    assert.equal(paused.snapshot.movies[0].id, movie.id);
    const bytes = fs.readFileSync(path.join(root, 'public/movies.json')); const priorSnapshot = store.snapshot();
    const outages = await registry.collect({ ...deps, request: async () => { throw new Error('Captured total outage'); } });
    const failed = await execute(outages, { operation: 'acquisition', now: '2026-10-15T12:00:00Z' });
    assert.equal(failed.outcome, 'preserved-acquisition-failure');
    assert.deepEqual(fs.readFileSync(path.join(root, 'public/movies.json')), bytes);
    const expiry = await loadMovieData(async () => { throw new Error('Refresh unavailable'); }, priorSnapshot, new Date('2026-10-16T12:00:00Z'));
    assert.equal(expiry.dataState, 'expired', 'Acquisition failure cannot stop original support expiring in cached/PWA data');
    const shadow = await execute([], { now: '2026-10-16T12:00:00Z', publish: false });
    assert.equal(shadow.snapshot.movies.length, 0);
    assert.ok(store.acquireLease('rollback'));
    assert.throws(() => publishWithRollback(store, shadow.snapshot, store.revision, () => { throw new Error('Captured audit failure'); }, root), /Captured audit failure/);
    store.releaseLease('rollback');
    assert.deepEqual(fs.readFileSync(path.join(root, 'public/movies.json')), bytes, 'Combined expired shadow and publication failure restore static output');
    assert.deepEqual(store.snapshot(), priorSnapshot, 'Publication rollback restores durable snapshot');
    const resumed = await execute(await registry.collect({ ...deps, now: () => '2026-10-16T13:00:00Z' }), { now: '2026-10-16T13:00:00Z', operation: 'acquisition' });
    assert.equal(resumed.snapshot.movies[0].id, movie.id); assert.equal(resumed.snapshot.movies[0].slug, movie.slug);
    assert.equal(resumed.snapshot.movies[0].cinemas.length, 2, 'Re-enabling collects through the same registry and reuses durable correction');
    assert.deepEqual(new PipelineStore(path.join(root, 'state.json')).allOverrides(), savedCorrections, 'All grouped correction/link records persist without duplication');
    const contradictory = await registry.collect({ ...deps, now: () => '2026-10-16T14:00:00Z', request: async request => {
      if (request.url !== 'https://fixture.test/b') return capturedRequest(request);
      const raw = cinemaResponse('b'); raw.cinema.address = 'Changed Street 9, 10117 Berlin';
      return { body: JSON.stringify(raw), status: 200, headers: {} };
    } });
    const conflicted = await execute(contradictory, { now: '2026-10-16T14:00:00Z', operation: 'acquisition' });
    assert.ok(store.issues().some(i => i.type === 'correction-conflict' && i.status === 'open'), 'Material conflicting venue evidence reopens review after recovery');
    assert.ok(conflicted.snapshot.movies[0].cinemas.some((c: any) => c.address === command.values.address), 'Saved correction remains the visible fallback');
    const metrics = resumed.snapshot.resolutionMetrics;
    console.log(JSON.stringify({ scenario: 'third-source-rollout', metrics, aliases: resumed.snapshot.movies[0].sourceAliases.length,
      observations: store.observations().length, unknownLineage: true }));
    console.log('combined third adapter/multiple instances, partial/malformed/outage, review, disable/expiry/re-enable and rollback acceptance passed');
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
