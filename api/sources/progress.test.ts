import assert from 'assert/strict';
import { criticAdapter } from './critic';
import { berlinAdapter } from './berlin';
import { SourceRegistry } from './registry';
import { defaultInstances } from './defaults';
import type { SourceDependencies } from './types';
import { PipelineStore } from '../pipeline/store';
import { runPipelineResult } from '../pipeline/pipeline';

const NOW = '2026-10-15T10:00:00Z';
const LATER = '2026-10-15T11:00:00Z';
const critic = `<div class="itemContainer"><h2><a href="/ov-movies-berlin/movie/a-film-123/">A Film (OV)</a></h2>
  <article class="cinema"><address><a href="/ov-movies-berlin/cinema/example/">Example Cinema</a>Example Street 1, 10115 Berlin</address>
  <table class="vorstellung"><thead><tr><th>Today</th></tr></thead><tbody><tr><td class="wird_gezeigt">20:00</td></tr></tbody></table></article></div>`;
const berlin = `<ul class="js-accordion"><li><span class="js-accordion__trigger"><span class="info">A Film (OV)</span></span>
  <div class="js-accordion__panel"><p>A Film läuft im "Example Cinema"</p>
  <a href="/kino/_bin/filmdetail.php/123">Film</a><a href="/kino/_bin/kinodetail.php/1">Cinema</a>
  <table><tbody><tr><td>Do, 15.10.26</td><td>20:00 (OV)</td></tr></tbody></table></div></li></ul>`;

async function main() {
  for (const [source, stalled] of [['critic.de', 'venue'], ['critic.de', 'film'], ['berlin.de', 'page'], ['berlin.de', 'venue']]) {
    const registry = new SourceRegistry([criticAdapter, berlinAdapter], defaultInstances.filter(instance => instance.id === source)
      .map(instance => ({ ...instance, limits: { ...instance.limits, attempts: 1, requestTimeoutMs: 1000,
        collectionTimeoutMs: 150, ...(stalled === 'film' ? { venueDetails: 0 } : {}) } })));
    const cache = new Map<string, any>();
    let clock = NOW;
    const dependencies: SourceDependencies = { now: () => clock, network: true, diagnostic: () => {},
      cache: { get: key => cache.get(key), set: (key, data, fetchedAt) => { cache.set(key, { data, fetchedAt }); } },
      request: async request => {
        if (request.purpose === stalled || stalled === 'page' && request.url.includes('startat')) {
          clock = LATER;
          return new Promise(() => {});
        }
        return { status: 200, headers: {}, body: source === 'critic.de' ? critic : berlin };
      } };
    const [collection] = await registry.collect(dependencies);
    assert.equal(collection.status, 'fresh', `${source} ${stalled} deadline preserves parsed fresh listings`);
    assert.equal(collection.records.filter(record => record.kind === 'screening').length, 1);
    assert.equal(collection.observedAt, NOW, 'Recovery does not renew acquisition time');
    assert.ok(collection.records.every(record => record.provenance.observedAt === NOW));
    assert.ok(collection.coverage.every(scope => scope.status !== 'complete'), 'A deadline cannot establish fresh absence');
    assert.ok(collection.diagnostics.some(diagnostic => diagnostic.code === 'collection-incomplete'));
    const replay = await registry.collect({ ...dependencies, network: false });
    assert.equal(replay[0].status, 'cached');
    assert.equal(replay[0].observedAt, NOW, 'The partial cache retains original listing time');
    const result = await runPipelineResult({ store: new PipelineStore(':memory:'), collections: [collection], now: LATER,
      operation: 'acquisition', network: false, model: null, tmdb: null, geocoder: null,
      osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }],
      publish: false, audit: false });
    assert.equal(result.outcome, 'degraded', 'Useful partial acquisition does not become total acquisition failure');
    assert.equal(result.snapshot?.movies.length, source === 'critic.de' ? 1 : 0,
      'Listings still require verified location evidence; a deadline cannot invent the missing Berlin venue address');
  }
  const detailRegistry = new SourceRegistry([criticAdapter], defaultInstances.filter(instance => instance.id === 'critic.de')
    .map(instance => ({ ...instance, limits: { ...instance.limits, venueDetails: 0, attempts: 1,
      requestTimeoutMs: 1000, collectionTimeoutMs: 150 } })));
  let detailClock = NOW;
  const [partiallyEnriched] = await detailRegistry.collect({ now: () => detailClock, network: true, diagnostic: () => {},
    cache: { get: () => undefined, set: () => {} }, request: async request => {
      if (request.purpose === 'film') {
        if (request.url.includes('second-film')) { detailClock = LATER; return new Promise(() => {}); }
        return { status: 200, headers: {}, body: critic.replace('</h2>', '</h2><dl><dt>Regie:</dt><dd>First Director</dd></dl>') };
      }
      return { status: 200, headers: {}, body: critic + critic.replaceAll('a-film-123', 'second-film-456').replaceAll('A Film', 'Second Film') };
    } });
  assert.equal(partiallyEnriched.records.filter(record => record.kind === 'screening').length, 2,
    'A later optional detail deadline preserves every earlier acquired listing');
  const enrichedListing = partiallyEnriched.records.find(record => record.kind === 'listing' && record.data.director === 'First Director');
  assert.ok(enrichedListing?.kind === 'listing', 'An earlier successful detail survives a later lookup deadline');
  assert.equal(enrichedListing.data.sourceDetails?.fetchedAt, NOW);
  assert.equal(partiallyEnriched.observedAt, NOW);
  console.log('collection deadline progress acceptance passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
