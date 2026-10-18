import assert from 'assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from './pipeline';
import { PipelineStore } from './store';
import { translateLegacyBatch } from './observations';
import { SourceRegistry } from '../sources/registry';
import { sourceDependencies } from '../sources/dependencies';
import type { SourceAdapter } from '../sources/types';
import type { SourceCollection } from '../../shared/contracts';

const FIRST = '2026-10-18T07:00:00Z', NEXT = '2026-10-18T08:00:00Z', DAY = '2026-10-19';
const source = 'scope-fixture';
const collection = (time: string, at: string) => translateLegacyBatch({ source, observedAt: at, status: 'fresh', complete: true,
  movies: [{ title: 'Coverage Film', sourceId: 'film', cinemas: [{ name: 'Example Cinema',
    address: 'Example Street 1, 10115 Berlin', url: 'https://captured.test/venue' }],
  showings: [{ cinema: 'Example Cinema', date: DAY, time, variant: 'OV' }] }] }) as SourceCollection;

async function scenario(name: string, configure: (row: any, next: SourceCollection) => void, disjoint = false) {
  const store = new PipelineStore(':memory:');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rejected-scope-'));
  let next = collection('20:00', FIRST);
  const adapter: SourceAdapter = { id: 'captured-scope', extractionVersion: 'fixture-v1', capabilities: ['screenings'],
    allows: () => false, collect: async () => next };
  const registry = new SourceRegistry([adapter], [{ id: source, adapterId: adapter.id, enabled: true,
    cacheIdentity: source, config: {}, limits: { requests: 0, filmDetails: 0, venueDetails: 0 } }]);
  const publish = async (now: string) => {
    const dependencies = { ...sourceDependencies(store, { network: true, now }),
      request: async () => { throw new Error('Fixture adapter must not request a provider'); } };
    return runPipeline({ store, collections: await registry.collect(dependencies), sourceRegistry: registry,
      sourceDependencies: dependencies, now, network: false, model: null, tmdb: null, osm: [], geocoder: null,
      publish: true, audit: false, publicationRoot: root, operation: 'acquisition' });
  };
  try {
    const first = await publish(FIRST);
    assert.deepEqual(Object.keys(first.movies[0].showings[DAY]), ['20:00']);
    next = collection('21:00', NEXT);
    const row: any = structuredClone(next.records.find(record => record.kind === 'screening'));
    row.recordId = row.provenance.recordId = 'rejected-sibling';
    row.data.time = '25:00'; row.data.variant = 'OmU';
    next.coverage = [{ sourceInstanceId: source, cinemaRecordIds: ['https://captured.test/venue'],
      dateRange: { from: DAY, to: DAY }, filters: { variant: 'OV' }, status: 'complete', emptyProgrammeConfirmed: false }];
    configure(row, next);
    next.records.push(row);
    const original = structuredClone(next);
    const snapshot = await publish(NEXT);
    const file = JSON.parse(fs.readFileSync(path.join(root, 'public/movies.json'), 'utf8'));
    const expected = disjoint ? ['21:00'] : ['20:00', '21:00'];
    assert.deepEqual(Object.keys(file.movies[0].showings[DAY]).sort(), expected, `${name}: actual public file preserves eligible support`);
    assert.deepEqual(Object.keys(snapshot.movies[0].showings[DAY]).sort(), expected);
    assert.equal(snapshot.ingestion[0].coverage[0].status, disjoint ? 'complete' : 'partial');
    assert.equal(snapshot.ingestion[0].safeForWithdrawal, disjoint);
    assert.equal(file.movies[0].identityStatus, 'source-only');
    assert.equal(file.movies[0].id, first.movies[0].id);
    assert.ok(snapshot.ingestion[0].diagnostics.some((diagnostic: any) => ['invalid-record', 'broken-reference'].includes(diagnostic.code)));
    assert.deepEqual(next, original, 'Original raw input, field states and provenance remain unchanged');
    assert.ok(snapshot.ingestion[0].diagnostics.some((diagnostic: any) =>
      JSON.stringify(diagnostic.evidence) === JSON.stringify(row)), 'Rejected original evidence remains inspectable');
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

async function main() {
  const cases: [string, (row: any, next: SourceCollection) => void, boolean?][] = [
    ['known OV replaces raw OmU', row => { row.fields.variant = { state: 'known', value: 'OV' }; }],
    ['failed variant', row => { row.fields.variant = { state: 'failed', reason: 'Lookup failed', retryable: true }; }],
    ['unknown variant', row => { row.fields.variant = { state: 'unknown' }; }],
    ['raw invalid control', row => { row.data.variant = [42]; }],
    ['known disjoint control', row => { row.fields.variant = { state: 'known', value: 'OmU' }; }, true],
    ['absent variant', row => { row.fields.variant = { state: 'absent', reason: 'Not reported' }; }],
    ['cleared variant', row => { row.fields.variant = { state: 'cleared', correctionId: 'fixture-clear', reason: 'Cleared' }; }],
    ['invalid known variant', row => { row.fields.variant = { state: 'known', value: [42] }; }],
    ['invalid field state', row => { row.fields.variant = { state: 'unrecognized' }; }],
    ['unknown variant with obsolete alias', row => {
      row.fields.variant = { state: 'unknown' }; row.data.movieVariants = ['OmU'];
    }],
    ['invalid variant with obsolete alias', row => { row.data.variant = [42]; row.data.movieVariants = ['OmU']; }],
    ['known venue replaces raw venue', row => {
      row.data.variant = 'OV'; row.data.venueRecordId = 'other-venue';
      row.fields.venueRecordId = { state: 'known', value: 'https://captured.test/venue' };
    }],
    ['failed venue', row => {
      row.data.variant = 'OV'; row.data.venueRecordId = 'other-venue';
      row.fields.venueRecordId = { state: 'failed', reason: 'Lookup failed', retryable: true };
    }],
    ['known disjoint venue', row => { row.data.variant = 'OV'; row.fields.venueRecordId = { state: 'known', value: 'other-venue' }; }, true],
    ['known date replaces raw date', row => {
      row.data.variant = 'OV'; row.data.date = '2026-10-20'; row.fields.date = { state: 'known', value: DAY };
    }],
    ['unknown date', row => {
      row.data.variant = 'OV'; row.data.date = '2026-10-20'; row.fields.date = { state: 'unknown' };
    }],
    ['invalid known date', row => { row.data.variant = 'OV'; row.fields.date = { state: 'known', value: '2026-02-30' }; }],
    ['known disjoint date', row => { row.data.variant = 'OV'; row.fields.date = { state: 'known', value: '2026-10-20' }; }, true],
    ['invalid time cannot prove disjoint time filter', (row, next) => {
      row.data.variant = 'OV'; next.coverage[0].filters = { time: '20:00' }; next.coverage[0].emptyProgrammeConfirmed = true;
    }],
    ['malformed record kind cannot validate an invalid time', (row, next) => {
      row.kind = 'unsupported-kind'; row.data.variant = 'OV';
      next.coverage[0].filters = { time: '20:00' }; next.coverage[0].emptyProgrammeConfirmed = true;
    }],
    ['known time replaces raw time', (row, next) => {
      row.data.variant = 'OV'; row.data.listingRecordId = 'missing-listing';
      row.fields.time = { state: 'known', value: '20:00' };
      next.coverage[0].filters = { time: '20:00' }; next.coverage[0].emptyProgrammeConfirmed = true;
    }],
    ['known disjoint time', (row, next) => {
      row.data.variant = 'OV'; row.data.listingRecordId = 'missing-listing'; row.fields.time = { state: 'known', value: '22:00' };
      next.coverage[0].filters = { time: '20:00' }; next.coverage[0].emptyProgrammeConfirmed = true;
    }, true],
    ['broken relationship uses effective variant', row => {
      row.data.time = '22:00'; row.fields.variant = { state: 'known', value: 'OV' };
      row.fields.listingRecordId = { state: 'known', value: 'missing-listing' };
    }],
    ['rejected listing follows effective dependent relationship', (row, next) => {
      const listing: any = structuredClone(next.records.find(record => record.kind === 'listing'));
      listing.recordId = listing.provenance.recordId = 'rejected-listing'; listing.fields.rawTitle = { state: 'known', value: '' };
      next.records.push(listing); row.data.time = '22:00';
      row.fields.listingRecordId = { state: 'known', value: listing.recordId };
      row.fields.variant = { state: 'known', value: 'OV' };
    }],
    ['conflicting records keep original overridden evidence', (row, next) => {
      row.data.time = '22:00'; row.fields.variant = { state: 'known', value: 'OV' };
      const conflict = structuredClone(row); conflict.data.time = '23:00'; next.records.push(conflict);
    }],
    ['later duplicate cannot disappear from affected coverage', (row, next) => {
      row.data.time = '22:00'; row.fields.variant = { state: 'known', value: 'OV' };
      const first = structuredClone(row); first.data.time = '23:00'; first.fields.variant = { state: 'known', value: 'OmU' };
      const second = structuredClone(first); second.data.time = '22:00'; next.records.push(first, second);
    }],
  ];
  const failures: string[] = [];
  for (const [name, configure, disjoint] of cases) {
    try { await scenario(name, configure, disjoint); console.log(`PASS ${name}`); }
    catch (error) { failures.push(name); console.error(error); }
  }
  assert.deepEqual(failures, [], 'All effective-scope publication scenarios pass');
  console.log('rejected scope publication acceptance tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
