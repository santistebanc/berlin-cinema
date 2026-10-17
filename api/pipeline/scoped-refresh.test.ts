import assert from 'assert/strict';
import { runPipeline } from './pipeline';
import { PipelineStore } from './store';
import { translateLegacyBatch } from './observations';
import type { Coverage, SourceCollection } from '../../shared/contracts';

const NOW = '2026-10-15T10:00:00Z';
const LATER = '2026-10-15T11:00:00Z';
const source = 'scoped-cinema';
const collection = (showings: any[], at = NOW): SourceCollection => translateLegacyBatch({ source, observedAt: at,
  status: 'fresh', complete: true, movies: [{ title: 'Scoped Film', sourceId: 'film', variants: ['OV'],
    cinemas: [{ name: 'Cinema A', address: 'Example Street 1, 10115 Berlin', url: 'https://fixture.test/a' },
      { name: 'Cinema B', address: 'Other Street 2, 10115 Berlin', url: 'https://fixture.test/b' }], showings }] }) as SourceCollection;
const showing = (cinema: string, date: string, variant = 'OV') => ({ cinema, date, time: variant === 'OmU' ? '21:00' : '20:00', variant });
const scope = (cinema: string, date: string, filters: Coverage['filters'] = {}): Coverage => ({ sourceInstanceId: source,
  cinemaRecordIds: [`https://fixture.test/${cinema}`], dateRange: { from: date, to: date }, filters,
  status: 'complete', emptyProgrammeConfirmed: true });
const execute = (store: PipelineStore, collections: SourceCollection[], now = NOW) => runPipeline({ store, collections, now,
  network: false, model: null, tmdb: null, osm: [], geocoder: null, publish: false, audit: false });
const entries = (data: any) => data.movies.flatMap((movie: any) => Object.entries(movie.showings).flatMap(([date, times]: any) =>
  Object.values(times).flatMap((rows: any) => rows.map((row: any) => `${row.cinema}|${date}|${row.variants.join(',')}`)))).sort();

async function main() {
  const store = new PipelineStore(':memory:');
  const initial = await execute(store, [collection([showing('Cinema A', '2026-10-16'), showing('Cinema A', '2026-10-16', 'OmU'),
    showing('Cinema A', '2026-10-17'), showing('Cinema B', '2026-10-16')])]);
  assert.equal(entries(initial).length, 4, 'Fixture publishes all four independent showings before the refresh');
  const olderOffset = collection([showing('Cinema A', '2026-10-16')], '2026-10-15T11:00:00+02:00');
  olderOffset.status = 'cached';
  const offsetReplay = await execute(store, [olderOffset]);
  assert.equal(offsetReplay.movies[0].sourceAliases[0].provenance.observedAt, NOW,
    'Equivalent ISO formats compare by instant: older offset replay cannot replace newer attribution or freshness');
  store.addOverride({ subject: `entity:${initial.movies[0].id}`, action: 'patch', patch: { fields: { plot: 'Reviewed plot' } },
    reason: 'Human correction', actor: 'fixture', evidenceFingerprint: 'fixture' });
  const refresh = collection([], LATER);
  refresh.coverage = [scope('a', '2026-10-16', { variant: 'OV' })];
  const result = await execute(store, [refresh], LATER);
  assert.deepEqual(entries(result), ['Cinema A|2026-10-16|OmU', 'Cinema A|2026-10-17|OV', 'Cinema B|2026-10-16|OV'],
    'A complete filtered day withdraws only omitted support within that partition');
  assert.equal(result.movies[0].id, initial.movies[0].id);
  assert.equal(result.movies[0].plot, 'Reviewed plot');
  assert.equal(result.movies[0].sourceAliases[0].provenance.observedAt, LATER);
  assert.equal(store.observations().filter(record => record.kind === 'screening').length, 4, 'Evidence history survives omission');
  const cached = collection([showing('Cinema A', '2026-10-16'), showing('Cinema A', '2026-10-16', 'OmU'),
    showing('Cinema A', '2026-10-17'), showing('Cinema B', '2026-10-16')]);
  cached.status = 'cached';
  const replayed = await execute(store, [cached], LATER);
  assert.deepEqual(entries(replayed), entries(result), 'Cached replay cannot resurrect withdrawn support or renew its observation time');
  await execute(store, [{ ...refresh, status: 'cached', observedAt: NOW }], LATER);
  const afterReplay = store.resources('source-coverage:').map(resource => resource.data);
  assert.ok(afterReplay.some(value => value.observedAt === LATER && value.status === 'complete'),
    'Retained replay cannot replace a newer completed partition with older incomplete coverage');
  store.close();

  const mixed = new PipelineStore(':memory:');
  await execute(mixed, [collection([showing('Cinema A', '2026-10-16'), showing('Cinema A', '2026-10-17'), showing('Cinema B', '2026-10-16')])]);
  const broken = collection([showing('Cinema B', '2026-10-17')], LATER);
  const invalid = structuredClone(collection([showing('Cinema A', '2026-10-17')], LATER).records.find(record => record.kind === 'screening'));
  invalid.data.time = 'broken';
  broken.records.push(invalid);
  broken.coverage = [scope('a', '2026-10-16'), scope('a', '2026-10-17'),
    { ...scope('b', '2026-10-16'), status: 'failed' }, { ...scope('b', '2026-10-17'), status: 'partial' }];
  const isolated = await execute(mixed, [broken], LATER);
  assert.deepEqual(entries(isolated), ['Cinema A|2026-10-17|OV', 'Cinema B|2026-10-16|OV', 'Cinema B|2026-10-17|OV'],
    'Malformed cinema/day and failed partitions preserve support without disabling independent complete partitions or valid sibling pages');
  assert.deepEqual(isolated.ingestion[0].coverage.map((value: Coverage) => value.status), ['complete', 'partial', 'failed', 'partial']);
  mixed.close();

  const pages = new PipelineStore(':memory:');
  await execute(pages, [collection([showing('Cinema A', '2026-10-16'), showing('Cinema B', '2026-10-16')])]);
  const failedPage = collection([], LATER);
  failedPage.coverage = [scope('a', '2026-10-16'), scope('b', '2026-10-16')];
  failedPage.diagnostics = [{ schemaVersion: 1, category: 'recovery', stage: 'request', code: 'page-failed',
    sourceInstanceId: source, reason: 'Cinema A page failed', retryable: true, scope: scope('a', '2026-10-16') }];
  const pageResult = await execute(pages, [failedPage], LATER);
  assert.deepEqual(entries(pageResult), ['Cinema A|2026-10-16|OV'],
    'A scoped failed request vetoes unsafe withdrawal while an independently complete sibling remains usable');
  pages.close();

  const malformedFilter = new PipelineStore(':memory:');
  await execute(malformedFilter, [collection([showing('Cinema A', '2026-10-16')])]);
  const sibling = collection([{ ...showing('Cinema A', '2026-10-16'), time: '21:00' }], LATER);
  const rejected: any = structuredClone(sibling.records.find(record => record.kind === 'screening'))!;
  rejected.recordId = 'malformed-filter'; rejected.provenance.recordId = rejected.recordId;
  rejected.data.time = 'invalid'; rejected.data.variant = [42];
  sibling.records.push(rejected);
  sibling.coverage = [scope('a', '2026-10-16', { variant: 'OV' })];
  const invalidMembership = await execute(malformedFilter, [sibling], LATER);
  assert.equal(entries(invalidMembership).length, 2,
    'A rejected row with invalid filter alternatives cannot prove disjointness or withdraw earlier support');
  assert.equal(invalidMembership.ingestion[0].coverage[0].status, 'partial');
  malformedFilter.close();

  const invalidBoolean = new PipelineStore(':memory:');
  await execute(invalidBoolean, [collection([showing('Cinema A', '2026-10-16')])]);
  const booleanRow = structuredClone(sibling);
  (booleanRow.records.find(record => record.recordId === 'malformed-filter')!.data as any).variant = true;
  const booleanMembership = await execute(invalidBoolean, [booleanRow], LATER);
  assert.equal(entries(booleanMembership).length, 2, 'A boolean is invalid variant evidence and cannot prove exclusion');
  invalidBoolean.close();

  const unknownMembership = new PipelineStore(':memory:');
  const unknown = collection([showing('Cinema A', '2026-10-16')]);
  for (const record of unknown.records) {
    if (record.kind === 'listing') record.data.variants = [];
    if (record.kind === 'screening') { delete record.data.variant; record.data.movieVariants = []; }
  }
  await execute(unknownMembership, [unknown]);
  const incomplete = collection([], LATER);
  incomplete.coverage = [scope('a', '2026-10-16'),
    { ...scope('a', '2026-10-16', { variant: 'OV' }), status: 'failed' }];
  const protectedUnknown = await execute(unknownMembership, [incomplete], LATER);
  assert.equal(entries(protectedUnknown).length, 1,
    'A failed filtered partition preserves retained support whose filter membership is unknown');
  unknownMembership.close();

  const filters = new PipelineStore(':memory:');
  await execute(filters, [collection([showing('Cinema A', '2026-10-16'), showing('Cinema A', '2026-10-16', 'OmU')])]);
  const invalidFilter = collection([], LATER);
  invalidFilter.coverage = [scope('a', '2026-10-16', { variant: 'OV' }),
    { ...scope('a', '2026-10-16', { variants: ['OmU'] }), sourceInstanceId: 'incorrect-source' }];
  const validFilter = await execute(filters, [invalidFilter], LATER);
  assert.deepEqual(entries(validFilter), ['Cinema A|2026-10-16|OmU'],
    'Invalid coverage for a disjoint filter cannot disable an independently validated complete partition');
  filters.close();

  const overlapping = new PipelineStore(':memory:');
  await execute(overlapping, [collection([showing('Cinema A', '2026-10-16'), showing('Cinema A', '2026-10-16', 'OmU'),
    showing('Cinema A', '2026-10-17'), showing('Cinema B', '2026-10-16')])]);
  const ranges = collection([], LATER);
  ranges.coverage = [{ ...scope('a', '2026-10-16'), dateRange: { from: '2026-10-16', to: '2026-10-17' } },
    { ...scope('a', '2026-10-16', { variants: ['OmU'] }), status: 'failed' },
    { ...scope('b', '2026-10-16'), dateRange: { from: '2026-10-17', to: '2026-10-16' } }];
  const overlap = await execute(overlapping, [ranges], LATER);
  assert.deepEqual(entries(overlap), ['Cinema A|2026-10-16|OmU', 'Cinema B|2026-10-16|OV'],
    'A failed overlapping filter vetoes only its own support; malformed sibling coverage cannot poison an independent cinema');
  const unconfirmed = collection([], '2026-10-15T12:00:00Z');
  unconfirmed.coverage = [{ ...scope('b', '2026-10-16'), emptyProgrammeConfirmed: false }];
  const unknownEmpty = await execute(overlapping, [unconfirmed], '2026-10-15T12:00:00Z');
  assert.deepEqual(entries(unknownEmpty), entries(overlap), 'Unexpected empty extraction cannot establish absence');
  assert.ok(unknownEmpty.ingestion[0].diagnostics.some((diagnostic: any) => diagnostic.code === 'unconfirmed-empty'));
  const expired = await execute(overlapping, [], '2026-10-16T11:00:00Z');
  assert.equal(expired.programmeStatus, 'no-current-support', 'Expired support differs from a checked empty programme in the public snapshot');
  const confirmed = await execute(overlapping, [collection([], '2026-10-16T11:00:00Z')], '2026-10-16T11:00:00Z');
  assert.equal(confirmed.programmeStatus, 'empty');
  overlapping.close();
  console.log('scoped refresh acceptance tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
