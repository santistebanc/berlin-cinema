import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runPipeline, runPipelineResult, publishWithRollback } from './pipeline';
import { PipelineStore } from './store';
import { translateLegacyBatch } from './observations';
import type { SourceCollection } from '../../shared/contracts';
import { createAdminServer } from '../../scripts/admin';
import { SourcePersistenceError } from '../sources/types';
import axios from 'axios';

const NOW = '2026-10-15T10:00:00Z';
const collection = translateLegacyBatch({ source: 'fixture', observedAt: NOW, status: 'fresh', complete: true,
  movies: [{ title: 'Retained Film', variants: ['OV'], cinemas: [{ name: 'Cinema', address: 'Example Street 1, 10115 Berlin' }],
    showings: [{ cinema: 'Cinema', date: '2026-10-16', time: '20:00' }] }] }) as SourceCollection;
const options = (store: PipelineStore): any => ({ store, now: NOW, network: false, model: null, tmdb: null, osm: [],
  geocoder: null, publish: false, audit: false });
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-run-recovery-'));
  const store = new PipelineStore(':memory:');
  try {
    const initial = await runPipeline({ ...options(store), collections: [collection] });
    publishWithRollback(store, initial, store.revision, () => {}, root);
    const previousFile = fs.readFileSync(path.join(root, 'public/movies.json'), 'utf8');
    const failed = { ...collection, status: 'failed', records: [], coverage: [], diagnostics: [{ schemaVersion: 1, category: 'recovery',
      stage: 'request', code: 'source-failed', sourceInstanceId: 'fixture', reason: 'HTTP 503 token=private-secret', retryable: true }] } as SourceCollection;
    const result = await runPipelineResult({ ...options(store), operation: 'acquisition', collections: [failed] });
    assert.equal(result.outcome, 'preserved-acquisition-failure', 'All-source acquisition failure reports failure rather than publishing a retained replay');
    assert.equal(result.snapshot.movies[0].slug, initial.movies[0].slug);
    assert.equal(fs.readFileSync(path.join(root, 'public/movies.json'), 'utf8'), previousFile);
    assert.ok(result.diagnostics.some(diagnostic => diagnostic.stage === 'collection' && diagnostic.fallback));
    assert.equal(result.diagnostics.filter(diagnostic => diagnostic.code === 'source-failed').length, 1,
      'Local operators receive one consolidated notice for the same failed source attempt');
    assert.equal(JSON.stringify(result.diagnostics).includes('private-secret'), false);
    const optional = await runPipelineResult({ ...options(store), collections: [collection],
      tmdb: { candidates: async () => { throw new Error('Provider unavailable token=private-secret'); } } as any });
    assert.equal(optional.outcome, 'degraded', 'Optional metadata outage permits source-only output with verified location');
    assert.equal(optional.snapshot.movies[0].slug, initial.movies[0].slug);
    assert.equal(optional.snapshot.movies[0].identityStatus, 'source-only');
    assert.ok(optional.diagnostics.some(diagnostic => diagnostic.stage === 'metadata' && diagnostic.fallback));
    assert.equal(JSON.stringify(optional.diagnostics).includes('private-secret'), false);
    assert.equal(store.issues().filter(issue => issue.type === 'metadata-match' && issue.status === 'open').length, 0,
      'An operational outage cannot invent an identity review question');
    const unlocated = structuredClone(collection);
    unlocated.records.find(record => record.kind === 'venue').data.address = '';
    const geo = await runPipelineResult({ ...options(new PipelineStore(':memory:')), collections: [unlocated],
      geocoder: { lookup: async () => { throw new Error('Provider unavailable'); } } });
    assert.equal(geo.outcome, 'degraded', 'A geocoding outage does not fail the whole operation');
    assert.equal(geo.snapshot.movies.length, 0, 'Missing location verification still prevents publication');
    assert.ok(geo.diagnostics.some(diagnostic => diagnostic.stage === 'geocoding'));
    const ambiguous = structuredClone(collection);
    ambiguous.records.find(record => record.kind === 'listing').data.rawTitle = 'Retained Film (Unclassified format)';
    ambiguous.records.find(record => record.kind === 'listing').fields.rawTitle = { state: 'known', value: 'Retained Film (Unclassified format)' };
    let modelRequested = false;
    const model = await runPipelineResult({ ...options(new PipelineStore(':memory:')), collections: [ambiguous], model: {
      provider: 'fixture', model: 'offline-test', inputUsdPerMillion: 0.01, decide: async () => { modelRequested = true; throw new Error('Model outage'); },
    } });
    assert.equal(modelRequested, true, 'Fixture exercises the external decision-provider boundary');
    assert.equal(model.outcome, 'degraded', 'Model outage retains deterministic/source-backed publication');
    assert.equal(model.snapshot.movies.length, 1);
    assert.ok(model.diagnostics.some(diagnostic => diagnostic.stage === 'decision-model'));
    const storageFailure = await runPipelineResult({ ...options(new PipelineStore(':memory:')), collections: [ambiguous], model: {
      provider: 'fixture', model: 'offline-test', inputUsdPerMillion: 0.01,
      decide: async () => { throw new SourcePersistenceError('Decision storage is unavailable'); },
    } });
    assert.equal(storageFailure.outcome, 'fatal', 'Persistence failures must propagate through optional model recovery');
    const ratingsStore = new PipelineStore(':memory:');
    const identified = structuredClone(collection);
    Object.assign(identified.records.find(record => record.kind === 'listing').data, { year: 2026, director: 'Director A' });
    Object.assign(identified.records.find(record => record.kind === 'listing').fields,
      { year: { state: 'known', value: 2026 }, director: { state: 'known', value: 'Director A' } });
    const metadata: any = { candidates: async () => [{ id: 123, title: 'Retained Film', original_title: 'Retained Film', release_date: '2026-01-01' }],
      getMovieDetails: async () => ({ credits: { crew: [{ job: 'Director', name: 'Director A' }] }, externalIds: {} }),
      enrichSelected: async () => ({ tmdbTitle: 'Retained Film', releaseYear: 2026, director: 'Director A', imdbId: 'tt1234567', plot: 'Verified plot' }) };
    const originalGet = axios.get;
    try {
      (axios as any).get = async () => { throw new Error('Fixture optional ratings outage'); };
      const ratings = await runPipelineResult({ ...options(ratingsStore), collections: [identified], tmdb: metadata,
        network: true, osmAddresses: [], omdbKey: 'fixture' });
      assert.equal(ratings.snapshot.movies[0].plot, 'Verified plot');
      assert.equal(ratings.outcome, 'degraded', 'An optional ratings outage is visible in the structured outcome while verified metadata stays available');
      assert.ok(ratings.diagnostics.some(diagnostic => diagnostic.stage === 'ratings' && diagnostic.fallback));
    } finally { axios.get = originalGet; ratingsStore.close(); }
    const server = createAdminServer(store);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as any).port;
      const response = await fetch(`http://127.0.0.1:${port}/api/review/state`);
      const state: any = await response.json();
      assert.equal(state.operations?.latest?.outcome, 'degraded', 'Local admin exposes the latest run outcome independently from identity questions');
      assert.ok(state.operations.latest.diagnostics.some((diagnostic: any) => diagnostic.stage === 'metadata' && diagnostic.fallback && diagnostic.retryable));
      assert.ok(state.operations.coverage.some((value: any) => value.data.sourceInstanceId === 'fixture'));
      assert.equal(JSON.stringify(state.operations).includes('private-secret'), false);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    console.log('pipeline run outcome and recovery acceptance tests passed');
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
