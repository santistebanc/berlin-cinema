import assert from 'assert/strict';
import { runPipeline } from './pipeline';
import { PipelineStore } from './store';
import { translateLegacyBatch } from './observations';
import { SourceCollectionSchema } from '../../shared/contracts';
import { linkEvidence } from './resolve';

const NOW = '2026-10-17T10:00:00Z';
function collection(source: string, values: any = {}, at = NOW, native = false) {
  const result = SourceCollectionSchema.parse(translateLegacyBatch({ source, observedAt: at, status: 'fresh', complete: true,
    movies: [{ title: 'Established Film', sourceId: 'film', url: `https://${source}.test/film`, ...values,
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: new Date(Date.parse(at) + 86400000).toISOString().slice(0, 10), time: '20:00', variant: 'OV' }] }] }));
  // Native stable upstream IDs deliberately survive even a replacement work.
  for (const record of result.records) {
    record.provenance.upstreamLineage = [source];
    if (native && record.kind === 'listing') record.recordId = record.provenance.recordId = 'stable-film-record';
    if (native && record.kind === 'screening') record.data.listingRecordId = 'stable-film-record';
  }
  return result;
}
function execute(store: PipelineStore, collections: ReturnType<typeof collection>[], now = NOW) {
  return runPipeline({ store, collections, now, network: false, model: null, tmdb: null,
    osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }],
    publish: false, audit: false });
}
function legacyFlags(store: PipelineStore) {
  // The original helper marked ordinary selected source fields verified as well.
  for (const entity of store.entities('film')) store.saveFields(entity.id, store.fields(entity.id).map(field => {
    const original = { ...field, identityVerified: true };
    delete original.evidenceRole;
    return original;
  }));
}
function criticCollection(values: any, at = NOW) {
  const result = collection('critic.de', values, at, true);
  for (const record of result.records) record.provenance.upstreamLineage = [];
  return result;
}
async function legacyReassociation() {
  const store = new PipelineStore(':memory:');
  const initial = await execute(store, [collection('detail', { runtime: 120, listingFields: { runtime: null },
    sourceDetails: { url: 'https://detail.test/film', fetchedAt: NOW, fields: { runtime: 120 } } })]);
  assert.equal(initial.movies[0].runtime, 120);
  legacyFlags(store);
  for (const now of ['2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z', '2026-10-17T13:00:00Z']) {
    const refreshed = await execute(store, [collection('detail', {}, now), collection('listing', { runtime: 90 }, now)], now);
    assert.equal(refreshed.movies.length, 1);
    assert.equal(refreshed.movies[0].runtime, 120, `Roleless original true flags retain detail priority across repeated reassociation at ${now}`);
    assert.equal(refreshed.movies[0].resolution.fields.find(field => field.field === 'runtime')?.value.state, 'known');
  }
}
async function replacementWork(roleless: boolean) {
  const store = new PipelineStore(':memory:');
  const first = await execute(store, [collection('detail', { title: 'Old Work', director: 'First Director', year: 2020, runtime: 120,
    listingFields: { director: null, year: null, runtime: null },
    sourceDetails: { url: 'https://detail.test/film', fetchedAt: NOW,
      fields: { director: 'First Director', year: 2020, runtime: 120 } } }, NOW, true)]);
  assert.equal(first.movies[0].runtime, 120);
  if (roleless) legacyFlags(store);
  for (const now of ['2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z']) {
    const next = await execute(store, [collection('detail', { title: 'New Work', director: 'Second Director', year: 2026, runtime: 90 }, now, true)], now);
    assert.equal(next.movies.length, 1);
    assert.notEqual(next.movies[0].id, first.movies[0].id, 'Changed identity gets its own film despite upstream record reuse');
    assert.ok(store.issues().some(issue => issue.type === 'source-identity-changed'), 'Identity conflict remains inspectable');
    assert.deepEqual([next.movies[0].title, next.movies[0].director, next.movies[0].year, next.movies[0].runtime],
      ['New Work', 'Second Director', 2026, 90], `Replacement work never inherits old facts (${roleless ? 'roleless original flags' : 'typed roles'})`);
  }
}
async function cachedReplacementWork(roleless: boolean) {
  const store = new PipelineStore(':memory:');
  // The actual default critic adapter accepts this URL. Its parser-v5 detail
  // cache is consulted by runPipeline before the resolver sees the new listing.
  const url = 'https://www.critic.de/movie/stable-film-record/';
  const first = await execute(store, [criticCollection({ url, title: 'Old Work', director: 'First Director', year: 2020, runtime: 120,
    listingFields: { director: null, year: null, runtime: null },
    sourceDetails: { url, fetchedAt: NOW, parserVersion: 5, creditsChecked: true,
      fields: { director: 'First Director', year: 2020, runtime: 120 } } })]);
  assert.equal(first.movies[0].runtime, 120);
  if (roleless) legacyFlags(store);
  const historical = structuredClone(first.movies[0].provenance.runtime);
  const cache = structuredClone(store.resource(`source-detail:${url}`));
  for (const now of ['2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z', '2026-10-17T13:00:00Z']) {
    // Missing year/runtime is essential: a fully populated replacement masks
    // the pre-resolution leak because cache fields only fill gaps.
    const next = await execute(store, [criticCollection({ url, title: 'New Work', director: 'Second Director' }, now)], now);
    assert.equal(next.movies.length, 1, 'Supported showings survive rejected optional cached details');
    assert.notEqual(next.movies[0].id, first.movies[0].id);
    assert.ok(store.issues().some(issue => issue.type === 'source-identity-changed'));
    assert.deepEqual([next.movies[0].title, next.movies[0].director, next.movies[0].year, next.movies[0].runtime],
      ['New Work', 'Second Director', null, null], `URL-keyed cached facts cannot fill a replacement work (${roleless ? 'legacy true flags' : 'typed roles'})`);
    assert.equal(next.movies[0].identityStatus, 'source-only');
    assert.equal(next.movies[0].sourceAliases[0].provenance.observedAt, now);
    assert.deepEqual(next.movies[0].sourceAliases[0].provenance.upstreamLineage, [], 'Cache reuse never invents independent provenance');
    assert.ok(next.ingestion.length && store.resource('pipeline:last-outcome')?.data.diagnostics.some((item: any) => item.code === 'detail-identity-conflict'));
    assert.deepEqual(store.resource(`source-detail:${url}`), cache, 'Withholding cached evidence preserves its original fields and fetch time');
    assert.deepEqual(first.movies[0].provenance.runtime, historical);
  }
  store.close();
}
async function cachedPartialDetails(legacyCache: boolean) {
  const store = new PipelineStore(':memory:');
  const url = 'https://www.critic.de/movie/runtime-only/';
  await execute(store, [criticCollection({ url, title: 'Old Work', director: 'First Director', year: 2020, runtime: 120,
    listingFields: { runtime: null }, sourceDetails: { url, fetchedAt: NOW, parserVersion: 5, creditsChecked: true,
      fields: { runtime: 120 } } })]);
  if (legacyCache) {
    legacyFlags(store);
    const original = structuredClone(store.resource(`source-detail:${url}`)!);
    delete original.data.listingIdentity;
    store.saveResource(`source-detail:${url}`, original.data, original.fetchedAt);
  }
  const now = '2026-10-17T11:00:00Z';
  const next = await execute(store, [criticCollection({ url, title: 'New Work', director: 'Second Director' }, now)], now);
  assert.deepEqual([next.movies[0].year, next.movies[0].runtime], [null, null],
    `A partial detail cache stays bound to the film it described, even without cached director/year fields (${legacyCache ? 'historical attribution' : 'typed binding'})`);
  store.close();
}
async function compatibleCachedDetails(roleless: boolean) {
  const store = new PipelineStore(':memory:');
  const url = 'https://www.critic.de/movie/established-film/';
  const first = await execute(store, [criticCollection({ url, title: 'Established Film', runtime: 120,
    listingFields: { runtime: null }, sourceDetails: { url, fetchedAt: NOW, parserVersion: 2,
      fields: { runtime: 120 } } })]);
  if (roleless) {
    legacyFlags(store);
    const original = structuredClone(store.resource(`source-detail:${url}`)!);
    delete original.data.listingIdentity;
    store.saveResource(`source-detail:${url}`, original.data, original.fetchedAt);
  }
  for (const now of ['2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z']) {
    const next = await execute(store, [criticCollection({ url, title: 'Established Film' }, now),
      collection('listing', { runtime: 90 }, now)], now);
    assert.equal(next.movies.length, 1);
    assert.equal(next.movies[0].id, first.movies[0].id);
    assert.equal(next.movies[0].runtime, 120, 'Compatible legacy cache and same-film reassociation keep detail priority');
    assert.equal(next.movies[0].provenance.runtime.observedAt, NOW, 'Cached detail attribution keeps the original fetch time');
    assert.equal(next.movies[0].provenance.runtime.evidenceRole, 'source-detail');
  }
  store.close();
}
async function protectedReassociation(separate: boolean) {
  const store = new PipelineStore(':memory:');
  await execute(store, [collection('detail', { runtime: 120, listingFields: { runtime: null },
    sourceDetails: { url: 'https://detail.test/film', fetchedAt: NOW, fields: { runtime: 120 } } })]);
  legacyFlags(store);
  const original = store.observations('detail').find(item => item.kind === 'listing')!;
  const ownerId = store.link(original.subject)!.entityId;
  const owner = store.entity(ownerId)!;
  const correction = store.addOverride({ subject: `entity:${ownerId}`, action: 'patch', patch: { fields: { country: 'Manual value' } },
    evidenceFingerprint: 'country-correction', actor: 'test', reason: 'Reviewed country' });
  store.saveFields(ownerId, [...store.fields(ownerId),
    { field: 'country', value: 'Manual value', source: 'manual', correctionId: correction.id, observationId: original.id,
      observedAt: NOW, selectedAt: NOW, identityVerified: true, evidenceRole: 'manual-correction', reason: 'Reviewed country' },
    { field: 'plot', value: 'Verified provider plot', source: 'TMDb:123', observationId: null,
      observedAt: NOW, selectedAt: NOW, identityVerified: true, evidenceRole: 'tmdb', reason: 'Verified provider metadata' }]);
  // Retained state has reassociated the source to a different canonical member.
  const targetId = 'reassociated-film';
  store.saveEntity({ ...owner, id: targetId, data: { ...owner.data, manualSeparate: separate } });
  if (separate) store.addOverride({ subject: original.subject, action: 'separate', targetId: ownerId,
    evidenceFingerprint: linkEvidence(original), actor: 'test', reason: 'Different edition confirmed' });
  const now = '2026-10-17T11:00:00Z';
  const current = collection('detail', { runtime: 90, country: 'Germany' }, now);
  // Use the new evidence fingerprint for the retained, explicit identity link.
  const currentListing = current.records.find(item => item.kind === 'listing')!;
  store.addOverride({ subject: original.subject, action: 'link', targetId,
    evidenceFingerprint: linkEvidence({ ...original, data: currentListing.data }), actor: 'test', reason: 'Established reassociation' });
  const next = await execute(store, [current], now);
  assert.equal(next.movies.length, 1);
  assert.equal(next.movies[0].runtime, separate ? 90 : 120, 'Manual separation blocks even otherwise compatible historical detail transfer');
  assert.equal(next.movies[0].country, 'Germany', 'An old entity correction is never transferred as ordinary historical evidence');
  assert.equal(next.movies[0].plot, null, 'An old entity verified provider field cannot transfer without accepted provider identity');
  assert.equal(next.movies[0].identityStatus, 'source-only');
}
async function detailAvailability(absent: boolean) {
  const store = new PipelineStore(':memory:');
  await execute(store, [collection('detail', { runtime: 120, listingFields: { runtime: null },
    sourceDetails: { url: 'https://detail.test/film', fetchedAt: NOW, fields: { runtime: 120 } } })]);
  legacyFlags(store);
  const now = absent ? '2026-10-17T11:00:00Z' : '2026-11-18T10:00:00Z';
  const detail = collection('detail', {}, now);
  if (absent) detail.records.find(record => record.kind === 'listing')!.fields.runtime = { state: 'absent', reason: 'Source explicitly removed this detail' };
  const next = await execute(store, [detail, collection('listing', { runtime: 90 }, now)], now);
  assert.equal(next.movies[0].runtime, 90, absent ? 'Explicit absence vetoes retained detail' : 'Expired detail cannot outrank fresh listing evidence');
}
async function main() {
  const cases = [legacyReassociation(), replacementWork(false), replacementWork(true),
    cachedReplacementWork(false), cachedReplacementWork(true),
    cachedPartialDetails(false), cachedPartialDetails(true),
    compatibleCachedDetails(false), compatibleCachedDetails(true),
    protectedReassociation(false), protectedReassociation(true), detailAvailability(false), detailAvailability(true)];
  const failures = (await Promise.allSettled(cases)).flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, 'Historical detail acceptance failures');
  console.log('historical source details retain authority only within a compatible film identity');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
