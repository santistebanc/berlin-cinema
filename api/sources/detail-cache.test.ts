import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SourceCollectionSchema, type SourceCollection } from '../../shared/contracts';
import { runPipeline } from '../pipeline/pipeline';
import { ingestCollections, translateLegacyBatch } from '../pipeline/observations';
import { PipelineStore } from '../pipeline/store';
import { criticAdapter } from './critic';
import { defaultInstances } from './defaults';
import { sourceDependencies } from './dependencies';
import { SourceRegistry } from './registry';
import { berlinAdapter } from './berlin';

const START = '2026-10-17T10:00:00Z';
const URL = 'https://www.critic.de/ov-movies-berlin/movie/stable-film-record/';
const KEY = `source-detail:${URL}`;
const venue = '<div id="kino_infos"><address><a class="mob-adr-lnk">Example Street 1, 10115 Berlin</a></address></div>';
function page(title: string, director: string) {
  return `<div class="itemContainer"><h2><a href="${URL}">${title} (OV)</a></h2>
    <dl class="oneline"><dt>D:</dt><dd>${director}</dd></dl>
    <article class="cinema"><address><a href="/ov-movies-berlin/cinema/example/">Example Cinema</a>Example Street 1, 10115 Berlin</address>
    <table class="vorstellung"><thead><tr><th>Today</th></tr></thead><tbody><tr><td class="wird_gezeigt">20:00</td></tr></tbody></table></article></div>`;
}
function execute(store: PipelineStore, collections: SourceCollection[], now: string, registry: SourceRegistry, publicationRoot?: string) {
  return runPipeline({ store, collections, now, sourceRegistry: registry, network: false, model: null, tmdb: null,
    geocoder: null, osm: [], publish: !!publicationRoot, publicationRoot, audit: false });
}
function seed(source: string, url = URL, title = 'Old Work', runtime = 120) {
  return SourceCollectionSchema.parse(translateLegacyBatch({ source, observedAt: START, status: 'fresh', complete: true,
    movies: [{ title, director: 'First Director', year: 2020, runtime, url, listingFields: { runtime: null },
      sourceDetails: { url, fetchedAt: START, parserVersion: 5, creditsChecked: true, fields: { runtime } },
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-17', time: '20:00', variant: 'OV' }] }] }));
}
async function acquisition(roleless: boolean, zeroLookups: boolean, bound = false, compatible = false) {
  const store = new PipelineStore(':memory:');
  const publicationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-detail-cache-'));
  const registry = new SourceRegistry([criticAdapter], defaultInstances.filter(item => item.id === 'critic.de')
    .map(item => zeroLookups ? { ...item, limits: { ...item.limits, filmDetails: 0, venueDetails: 0 } } : item));
  const details = { url: URL, fetchedAt: START, parserVersion: 5, creditsChecked: true, fields: { runtime: 120 },
    ...(bound ? { listingIdentity: { title: 'Old Work', director: 'First Director', year: 2020 } } : {}) };
  const historical = SourceCollectionSchema.parse(translateLegacyBatch({ source: 'critic.de', observedAt: START, status: 'fresh', complete: true,
    movies: [{ title: 'Old Work', director: 'First Director', year: 2020, runtime: 120, url: URL,
      listingFields: { runtime: null }, sourceDetails: details,
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-17', time: '20:00', variant: 'OV' }] }] }));
  await execute(store, [historical], START, registry);
  // Represent supported pre-binding data, preserving exact original attribution.
  store.saveResource(KEY, details, START);
  if (roleless) for (const entity of store.entities('film')) store.saveFields(entity.id, store.fields(entity.id).map(field => {
    const original = { ...field, identityVerified: true }; delete original.evidenceRole; return original;
  }));
  const originalBytes = JSON.stringify(store.resource(KEY));
  const originalObservations = structuredClone(store.observations());
  for (const now of ['2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z']) {
    const title = compatible ? 'Old Work' : 'New Work';
    const director = compatible ? 'First Director' : 'Second Director';
    const deps = { ...sourceDependencies(store, { network: true, now }), request: async (request: any) => ({
      status: 200, headers: {}, body: request.purpose === 'venue' ? venue : page(title, director) }) };
    const collected = (await registry.collect(deps))[0];
    const snapshot = await execute(store, [collected], now, registry, publicationRoot);
    assert.equal(snapshot.movies.length, 1, 'Source-only supported showing survives optional cache rejection');
    const movie = snapshot.movies[0];
    assert.deepEqual([movie.title, movie.director, movie.year, movie.runtime],
      [title, director, compatible ? 2020 : null, compatible ? 120 : null],
      `Acquisition cache identity: roleless=${roleless}, zeroLookups=${zeroLookups}, bound=${bound}, compatible=${compatible}`);
    assert.equal(movie.identityStatus, 'source-only');
    const published = JSON.parse(fs.readFileSync(path.join(publicationRoot, 'public/movies.json'), 'utf8'));
    assert.equal(published.movies[0].runtime, compatible ? 120 : null, 'Actual public file withholds incompatible cache evidence');
    assert.ok(movie.showings['2026-10-17']['20:00']);
    assert.deepEqual(movie.sourceAliases[0].provenance.upstreamLineage, []);
    assert.equal(JSON.stringify(store.resource(KEY)), originalBytes, 'Cache bytes, original fetch time and binding are unchanged');
    if (compatible) assert.equal(movie.provenance.runtime.observedAt, START);
    else {
      assert.ok(collected.diagnostics.some(item => item.code === 'detail-identity-conflict'), 'Acquisition reports withheld evidence');
      assert.ok(store.resource('pipeline:last-outcome')?.data.diagnostics.some((item: any) => item.code === 'detail-identity-conflict'));
    }
    const recalculated = await execute(store, [], now, registry);
    assert.equal(recalculated.movies[0].runtime, compatible ? 120 : null, 'Recalculation preserves the acquisition decision');
    for (const observation of originalObservations) assert.deepEqual(store.observations().find(item => item.id === observation.id)?.data, observation.data);
  }
  store.close();
  fs.rmSync(publicationRoot, { recursive: true, force: true });
}
async function inheritedReplay(status: SourceCollection['status']) {
  const store = new PipelineStore(':memory:');
  const registry = new SourceRegistry([criticAdapter], defaultInstances.filter(item => item.id === 'critic.de'));
  const historical = seed('critic.de');
  await execute(store, [historical], START, registry);
  const originalBytes = JSON.stringify(store.resource(KEY));
  const inherited = seed('critic.de', URL, 'New Work');
  inherited.status = status;
  inherited.observedAt = '2026-10-17T11:00:00Z';
  for (const record of inherited.records) {
    record.provenance.observedAt = record.provenance.fetchedAt = inherited.observedAt;
    if (record.kind === 'listing') {
      record.data.director = 'Second Director'; delete record.data.year;
      record.fields.director = { state: 'known', value: 'Second Director' };
      record.fields.year = { state: 'unknown' };
    }
  }
  // This is the retained envelope an older acquisition implementation could have
  // saved or handed off as progress, before the cache compatibility guard existed.
  let collected = inherited;
  if (status === 'cached') {
    store.saveResource('source-collection:critic', inherited, inherited.observedAt);
    collected = (await registry.collect(sourceDependencies(store, { network: false }), { retained: true }))[0];
    assert.equal(collected.status, 'cached');
  }
  ingestCollections(store, [collected]);
  const listing = store.observations('critic.de', true).find(item => item.kind === 'listing' && item.data.title === 'New Work')!;
  assert.equal(listing.data.runtime, undefined, `${status} ingestion rejects inherited detail before it becomes observation evidence`);
  assert.equal(listing.data.sourceDetails, undefined);
  assert.equal(listing.fields?.sourceDetails.state, 'unknown', 'Rejected details cannot survive in the field sidecar');
  assert.equal(JSON.stringify(store.resource(KEY)), originalBytes, 'Replay never overwrites original cache attribution');
  assert.ok(store.resource('source-validation:critic.de')?.data.diagnostics.some((item: any) => item.code === 'detail-identity-conflict'));
  const snapshot = await execute(store, [], inherited.observedAt, registry);
  const movie = snapshot.movies.find((item: any) => item.title === 'New Work');
  assert.ok(movie);
  assert.equal(movie.runtime, null);
  store.close();
}
async function configuredInstances() {
  const store = new PipelineStore(':memory:');
  const instances = ['cinema-a', 'cinema-b'].map(id => ({ ...defaultInstances[0], id, cacheIdentity: id, legacyCache: false }));
  const registry = new SourceRegistry([criticAdapter], instances);
  await execute(store, [seed('cinema-a'), seed('cinema-b', URL, 'New Work', 95)], START, registry);
  const keys = instances.map(instance => registry.cacheKey(instance, KEY));
  const original = keys.map(key => JSON.stringify(store.resource(key)));
  const now = '2026-10-17T11:00:00Z';
  const collections = await registry.collect({ ...sourceDependencies(store, { network: true, now }),
    request: async request => ({ status: 200, headers: {}, body: request.purpose === 'venue' ? venue : page('New Work', 'First Director') }) });
  const a = collections[0].records.find(record => record.kind === 'listing')!;
  const b = collections[1].records.find(record => record.kind === 'listing')!;
  assert.equal(a.data.runtime, undefined, 'Incompatible cinema A history is rejected within its own namespace');
  assert.equal(b.data.runtime, 95, 'Compatible cinema B history remains usable at the same URL');
  assert.ok(collections[0].diagnostics.some(item => item.code === 'detail-identity-conflict'));
  assert.ok(!collections[1].diagnostics.some(item => item.code === 'detail-identity-conflict'));
  for (const collection of collections) await execute(store, [collection], now, registry);
  assert.deepEqual(keys.map(key => JSON.stringify(store.resource(key))), original);
  assert.equal(store.resource(KEY), null, 'Configured instances do not write the legacy global cache');
  store.close();
}
async function otherAdapter() {
  const store = new PipelineStore(':memory:');
  const url = 'https://www.berlin.de/kino/_bin/filmdetail.php/123';
  const key = `source-detail:${url}`;
  const registry = new SourceRegistry([berlinAdapter], defaultInstances.filter(item => item.id === 'berlin.de'));
  await execute(store, [seed('berlin.de', url)], START, registry);
  const original = JSON.stringify(store.resource(key));
  const now = '2026-10-17T11:00:00Z';
  const listing = `<ul class="js-accordion"><li><span class="js-accordion__trigger"><span class="info">New Work (OV)</span></span>
    <div class="js-accordion__panel"><p>New Work läuft im "Example Cinema"</p>
    <a href="/kino/_bin/filmdetail.php/123">Film</a><a href="/kino/_bin/kinodetail.php/1">Cinema</a>
    <table><tbody><tr><td>Sa, 17.10.26</td><td>20:00 (OV)</td></tr></tbody></table></div></li></ul>`;
  const collections = await registry.collect({ ...sourceDependencies(store, { network: true, now }), request: async request => ({
    status: 200, headers: {}, body: request.purpose === 'venue'
      ? '<div class="article-attributes"><span class="street-address">Example Street 1</span><span class="postal-code">10115</span><span class="locality">Berlin</span></div>'
      : request.url.includes('startat') ? '<ul class="js-accordion"></ul>' : listing }) });
  const snapshot = await execute(store, collections, now, registry);
  assert.equal(snapshot.movies.length, 1);
  assert.equal(snapshot.movies[0].title, 'New Work');
  assert.equal(snapshot.movies[0].runtime, null);
  assert.ok(collections[0].diagnostics.some(item => item.code === 'detail-identity-conflict'));
  assert.equal(JSON.stringify(store.resource(key)), original);
  store.close();
}
async function progressRecovery() {
  const store = new PipelineStore(':memory:');
  const instance = { ...defaultInstances[0], limits: { ...defaultInstances[0].limits, venueDetails: 0, collectionTimeoutMs: 50 } };
  const registry = new SourceRegistry([criticAdapter], [instance]);
  await execute(store, [seed('critic.de')], START, registry);
  const original = JSON.stringify(store.resource(KEY));
  const now = '2026-10-17T11:00:00Z';
  const collections = await registry.collect({ ...sourceDependencies(store, { network: true, now }), request: async request => {
    if (request.purpose === 'film') return new Promise(() => {});
    return { status: 200, headers: {}, body: page('New Work', 'Second Director')
      + page('Another Work', '').replaceAll('stable-film-record', 'another-work') };
  } });
  assert.equal(collections[0].status, 'fresh');
  assert.ok(collections[0].diagnostics.some(item => item.code === 'collection-incomplete'));
  const snapshot = await execute(store, collections, now, registry);
  assert.equal(snapshot.movies.find((movie: any) => movie.title === 'New Work')?.runtime, null);
  assert.equal(JSON.stringify(store.resource(KEY)), original);
  store.close();
}
async function collectedBinding() {
  const store = new PipelineStore(':memory:');
  const registry = new SourceRegistry([criticAdapter], [defaultInstances[0]]);
  const deps = { ...sourceDependencies(store, { network: true, now: START }), request: async (request: any) => ({
    status: 200, headers: {}, body: request.purpose === 'venue' ? venue
      : request.purpose === 'film' ? page('Old Work', 'First Director').replace('</h2>', '</h2><dl><dt>Runtime:</dt><dd>120 min</dd></dl>')
        : page('Old Work', 'First Director') }) };
  const initial = (await registry.collect(deps))[0];
  const details = initial.records.find(record => record.kind === 'listing')!.data.sourceDetails;
  assert.equal(details.fields.runtime, 120);
  assert.equal(details.listingIdentity.title, 'Old Work', 'Actual collection binds the original film before attaching optional facts');
  await execute(store, [initial], START, registry);
  const original = JSON.stringify(store.resource(KEY));
  const now = '2026-10-17T11:00:00Z';
  const next = await registry.collect({ ...deps, now: () => now, request: async request => ({ status: 200, headers: {},
    body: request.purpose === 'venue' ? venue : page('New Work', 'Second Director') }) });
  const snapshot = await execute(store, next, now, registry);
  assert.equal(snapshot.movies[0].runtime, null);
  assert.equal(JSON.stringify(store.resource(KEY)), original);
  store.close();
}
async function main() {
  const cases = [];
  for (const roleless of [false, true]) for (const zero of [false, true]) cases.push(acquisition(roleless, zero));
  cases.push(acquisition(false, true, true), acquisition(true, false, false, true), inheritedReplay('fresh'), inheritedReplay('cached'));
  cases.push(configuredInstances(), otherAdapter(), progressRecovery(), collectedBinding());
  const failures = (await Promise.allSettled(cases)).flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, 'Adapter acquisition cache acceptance failures');
  console.log('adapter acquisition and ingestion preserve original film-detail attribution');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
