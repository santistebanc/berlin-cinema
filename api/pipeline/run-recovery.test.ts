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

async function rejectedCollectionRecovery(label: string, input: unknown, expectedStatus = 'rejected-source',
  code = expectedStatus === 'rejected-source' ? 'invalid-envelope' : 'invalid-diagnostic') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-envelope-recovery-'));
  const state = path.join(root, 'state.json');
  const store = new PipelineStore(state);
  const publication = { ...options(store), publish: true, publicationRoot: root, operation: 'acquisition' };
  try {
    const initial = await runPipelineResult({ ...publication, collections: [collection] });
    assert.equal(initial.outcome, 'published');
    const retained = structuredClone(store.observations(undefined, true));
    const sibling = translateLegacyBatch({ source: 'sibling', observedAt: NOW, status: 'fresh', complete: true,
      movies: [{ title: 'Usable Film', cinemas: [{ name: 'Cinema', address: 'Example Street 1, 10115 Berlin' }],
        showings: [{ cinema: 'Cinema', date: '2026-10-16', time: '21:00' }] }] }) as SourceCollection;
    const originalInput = structuredClone(input);
    const first = await runPipelineResult({ ...publication, collections: [input, sibling] });
    assert.equal(first.outcome, 'degraded', `${label}: rejected input cannot block its valid sibling`);
    const snapshot: any = first.snapshot;
    const rejected = snapshot.ingestion.find((item: any) => item.status === expectedStatus);
    assert.ok(rejected, `${label}: structured ingestion rejection is retained`);
    assert.equal(rejected.safeForWithdrawal, false);
    assert.equal(rejected.acceptedRecords, 0);
    assert.ok(rejected.diagnostics.some((item: any) => item.code === code));
    if (expectedStatus === 'rejected-source') assert.deepEqual(rejected.diagnostics[0].evidence,
      input === undefined ? null : JSON.parse(JSON.stringify(input)), 'The original rejected JSON envelope stays inspectable');
    assert.ok(first.diagnostics.some(item => item.code === code && item.fallback));
    assert.equal(first.diagnostics.some(item => item.code === 'forged-success'), false,
      'Diagnostics from an invalid envelope cannot masquerade as validated input');
    assert.deepEqual(input, originalInput, 'Boundary validation cannot mutate the supplied evidence');
    const published = JSON.parse(fs.readFileSync(path.join(root, 'public/movies.json'), 'utf8'));
    assert.deepEqual(published, first.snapshot, 'The degraded snapshot is actually published');
    assert.deepEqual(published.movies.map((movie: any) => movie.title).sort(), ['Retained Film', 'Usable Film']);
    assert.ok(published.movies.find((movie: any) => movie.title === 'Retained Film').showings['2026-10-16']['20:00']);
    assert.ok(published.movies.find((movie: any) => movie.title === 'Usable Film').showings['2026-10-16']['21:00']);
    for (const original of retained) assert.deepEqual(store.observations().find(item => item.id === original.id), original,
      'Rejected input preserves original retained evidence and its timestamps');
    assert.equal(fs.existsSync(state + '.lock'), false, 'Rejected input releases the actual disk writer lease');
    const second = await runPipelineResult({ ...publication, collections: [sibling] });
    assert.equal(second.outcome, 'published', 'The next valid run succeeds on the same store');
    assert.equal(fs.existsSync(state + '.lock'), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'public/movies.json'), 'utf8')), second.snapshot);
    console.log(`PASS collection recovery: ${label}`);
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

async function diskWriterFailureRecovery() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-writer-recovery-'));
  const state = path.join(root, 'state.json');
  const store = new PipelineStore(state);
  const publication = { ...options(store), collections: [collection], publish: true, publicationRoot: root };
  try {
    assert.equal((await runPipelineResult(publication)).outcome, 'published');
    const files = ['public/movies.json', 'public/sitemap.xml'];
    const before = files.map(file => fs.readFileSync(path.join(root, file)));
    const snapshot = structuredClone(store.snapshot());
    const unavailable = await runPipelineResult({ ...publication, operation: 'acquisition', collections: [null] });
    assert.equal(unavailable.outcome, 'preserved-acquisition-failure', 'All rejected acquisition keeps the previous publication');
    assert.ok(unavailable.diagnostics.some(item => item.code === 'invalid-envelope'));
    assert.deepEqual(store.snapshot(), snapshot);
    assert.equal(fs.existsSync(state + '.lock'), false);
    const dependencies = Object.defineProperty({}, 'request', { enumerable: true,
      get() { throw new SourcePersistenceError('Fixture dependency initialization failed'); } });
    const setupFailure = await runPipelineResult({ ...publication, sourceDependencies: dependencies });
    assert.equal(setupFailure.outcome, 'fatal', 'Unexpected dependency setup failures remain explicit errors');
    assert.ok(setupFailure.diagnostics.some(item => /dependency initialization failed/.test(item.reason)));
    assert.equal(fs.existsSync(state + '.lock'), false, 'Post-acquisition setup is covered by lease cleanup');
    for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(path.join(root, file)), before[index]);
    assert.equal((await runPipelineResult(publication)).outcome, 'published');
    // Fail at the durable filesystem boundary, including the failure-diagnostic
    // flush. Lease cleanup must still allow the same store to recover later.
    const rename = fs.renameSync;
    let attempted = false;
    try {
      fs.renameSync = (from, to) => {
        if (to === state) { attempted = true; throw new Error('Fixture durable state write failed'); }
        return rename(from, to);
      };
      const failed = await runPipelineResult(publication);
      assert.equal(attempted, true);
      assert.equal(failed.outcome, 'fatal');
      assert.ok(failed.diagnostics.some(item => item.code === 'processing-failed' && /durable state write failed/.test(item.reason)));
      assert.deepEqual(store.snapshot(), snapshot);
      for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(path.join(root, file)), before[index]);
      assert.equal(fs.existsSync(state + '.lock'), false, 'Even failed error persistence releases the disk lease');
    } finally { fs.renameSync = rename; }
    assert.equal((await runPipelineResult(publication)).outcome, 'published');
    const contender = new PipelineStore(state);
    assert.ok(store.acquireLease('fixture-owner'));
    try {
      const blocked = await runPipelineResult({ ...publication, store: contender });
      assert.equal(blocked.outcome, 'fatal');
      assert.ok(blocked.diagnostics.some(item => /Another pipeline\/admin writer/.test(item.reason)));
      assert.equal(fs.existsSync(state + '.lock'), true, 'A rejected competing writer cannot release another owner');
    } finally { store.releaseLease('fixture-owner'); contender.close(); }
    assert.equal((await runPipelineResult(publication)).outcome, 'published');
    assert.equal(fs.existsSync(state + '.lock'), false);
    console.log('PASS disk writer failure and competing-owner recovery');
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
async function main() {
  const empty = { ...collection, records: [], coverage: collection.coverage.map(scope => ({ ...scope, emptyProgrammeConfirmed: true })) };
  const forged = { schemaVersion: 1, category: 'recovery', stage: 'collection', code: 'forged-success',
    sourceInstanceId: 'sibling', reason: 'Unchecked envelope is not validated evidence', retryable: false };
  for (const [label, input] of [
    ['null', null], ['undefined', undefined], ['boolean', false], ['number', 42], ['string', 'fixture'],
    ['empty array', []], ['array of collections', [collection]], ['invalid records control', { ...empty, records: null }],
    ['null diagnostics', { ...empty, diagnostics: null }], ['object diagnostics', { ...empty, diagnostics: forged }],
    ['invalid source metadata', { ...empty, sourceInstanceId: { id: 'fixture' }, diagnostics: [forged] }],
    ['invalid observation time', { ...empty, observedAt: { time: NOW }, diagnostics: [forged] }],
    ['invalid status', { ...empty, status: ['fresh'], diagnostics: [forged] }],
    ['forged complete envelope', { ...empty, records: null, safeForWithdrawal: true, diagnostics: [forged] }],
  ] as [string, unknown][]) await rejectedCollectionRecovery(label, input);
  await rejectedCollectionRecovery('malformed diagnostic entries', { ...empty, diagnostics: [null, undefined, 42, 'diagnostic', [],
    { ...forged, reason: [] }, { ...forged, retryable: 'false' }, { ...forged, evidence: undefined, stage: null }] }, 'partial');
  await rejectedCollectionRecovery('malformed coverage entries', { ...empty, coverage: [null, undefined, [], { status: 'complete' }] },
    'partial', 'invalid-coverage');
  await diskWriterFailureRecovery();
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
    // This outage case starts with original source credits independently
    // identifying the provider film. Unknown/copied origins are tested separately.
    identified.records.find(record => record.kind === 'listing').provenance.upstreamLineage = ['fixture-original:film-credits'];
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
