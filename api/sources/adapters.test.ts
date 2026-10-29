import assert from 'assert/strict';
import { criticAdapter } from './critic';
import { berlinAdapter } from './berlin';
import { SourceRegistry } from './registry';
import { defaultInstances } from './defaults';
import { SourcePersistenceError, type SourceDependencies } from './types';
import { SourceCollectionSchema } from '../../shared/contracts';
import { PipelineStore } from '../pipeline/store';
import { runPipeline } from '../pipeline/pipeline';
import { retainedDependencies } from './runtime';
import { translateLegacyBatch } from '../pipeline/observations';
import fs from 'fs';
import os from 'os';
import path from 'path';

const NOW = '2026-10-15T10:00:00Z';
const critic = `<div class="itemContainer"><h2><a href="/ov-movies-berlin/movie/a-film-123/">A Film (OV)</a></h2>
  <article class="cinema"><address><a href="/ov-movies-berlin/cinema/example/">Example Cinema</a>Example Street 1, 10115 Berlin</address>
  <table class="vorstellung"><thead><tr><th>Today</th></tr></thead><tbody><tr><td class="wird_gezeigt">20:00</td></tr></tbody></table></article></div>`;
const berlin = `<ul class="js-accordion"><li><span class="js-accordion__trigger"><span class="info">A Film (OV)</span></span>
  <div class="js-accordion__panel"><p>A Film läuft im "Example Cinema"</p>
  <a href="/kino/_bin/filmdetail.php/123">Film</a><a href="/kino/_bin/kinodetail.php/1">Cinema</a>
  <table><tbody><tr><td>Do, 15.10.26</td><td>20:00 (OV)</td></tr></tbody></table></div></li></ul>`;
const criticVenue = '<div id="kino_infos"><address><a class="mob-adr-lnk">Example Street 1, 10115 Berlin</a></address><a class="external-link" href="https://cinema.example/">Website of Example Cinema</a></div>';
const berlinVenue = '<div class="article-attributes"><span class="street-address">Example Street 1</span><span class="postal-code">10115</span><span class="locality">Berlin</span></div>';
const details = '<dl><dt>Regie:</dt><dd>A Director</dd><dt>Jahr:</dt><dd>2026</dd></dl>';

async function main() {
  const cache = new Map<string, any>();
  const deps: SourceDependencies = { now: () => NOW, network: true, diagnostic: () => {},
    cache: { get: key => cache.get(key), set: (key, data, fetchedAt) => { cache.set(key, { data, fetchedAt }); } },
    request: async ({ url, purpose, headers }) => ({ status: 200, headers: {}, body: purpose === 'film'
      ? url.includes('critic.de') ? critic.replace('</h2>', `</h2>${details}`) : details
      : purpose === 'venue' ? url.includes('critic.de') ? criticVenue : berlinVenue
      : url.includes('critic.de') ? headers?.['Accept-Language']?.startsWith('en-GB') ? critic : critic.replace('Today', 'Heute')
      : url.includes('startat') ? '<ul class="js-accordion"></ul>' : berlin }),
  };
  const registry = new SourceRegistry([criticAdapter, berlinAdapter], defaultInstances);
  {
    const detailCache = new Map<string, any>();
    let title = 'Old Work'; let now = NOW;
    const captured: SourceDependencies = { ...deps, now: () => now,
      cache: { get: key => detailCache.get(key), set: (key, data, fetchedAt) => { detailCache.set(key, { data, fetchedAt }); } },
      request: async request => ({ status: 200, headers: {}, body: request.purpose === 'film'
        ? critic.replace('A Film (OV)', 'Old Work (OV)').replace('</h2>', '</h2><dl><dt>Runtime:</dt><dd>120 min</dd></dl>')
        : critic.replace('A Film (OV)', `${title} (OV)`) }) };
    const instances = defaultInstances.filter(item => item.id === 'critic.de').map(item => ({ ...item,
      limits: { ...item.limits, venueDetails: 0, filmDetails: 1 } }));
    const original = (await new SourceRegistry([criticAdapter], instances).collect(captured))[0];
    assert.equal(original.records.find(record => record.kind === 'listing')!.data.runtime, 120);
    const previous = structuredClone(detailCache.get('source-detail:https://www.critic.de/ov-movies-berlin/movie/a-film-123/'));
    title = 'New Work'; now = '2026-10-15T11:00:00Z';
    const noDetails = new SourceRegistry([criticAdapter], instances.map(item => ({ ...item, limits: { ...item.limits, filmDetails: 0 } })));
    const refreshed = (await noDetails.collect(captured))[0];
    assert.equal(refreshed.records.filter(record => record.kind === 'screening').length, 1);
    assert.equal(refreshed.records.find(record => record.kind === 'listing')!.data.runtime, undefined,
      'A collected partial detail cache cannot supply another film reusing its URL and missing all credits');
    assert.ok(refreshed.diagnostics.some(item => item.code === 'detail-identity-conflict'));
    assert.deepEqual(detailCache.get('source-detail:https://www.critic.de/ov-movies-berlin/movie/a-film-123/'), previous);
  }
  const collections = await registry.collect(deps);
  assert.deepEqual(collections.map(item => item.status), ['fresh', 'fresh']);
  for (const collection of collections) {
    SourceCollectionSchema.parse(collection);
    assert.equal(collection.coverage[0].status, 'complete');
    assert.equal(collection.records.filter(item => item.kind === 'screening').length, 1);
    const listing = collection.records.find(item => item.kind === 'listing')!;
    assert.equal(listing.provenance.observedAt, NOW);
    assert.equal(listing.data.director, 'A Director');
    assert.equal(listing.data.sourceDetails.fetchedAt, NOW);
    const snapshot = await runPipeline({ store: new PipelineStore(':memory:'), collections: [collection],
      sourceRegistry: registry, sourceDependencies: deps, now: NOW, network: false, model: null, tmdb: null,
      osm: [], publish: false, audit: false });
    assert.equal(snapshot.total, 1, `${collection.sourceInstanceId} publishes a supported listing`);
    assert.ok(snapshot.movies[0].showings['2026-10-15']['20:00']);
    if (collection.sourceInstanceId === 'critic.de') assert.equal(snapshot.movies[0].cinemas[0].websiteUrl, 'https://cinema.example/');
  }
  const partial = await registry.collect({ ...deps, request: async request => {
    if (request.url.includes('startat')) throw new Error('Second page unavailable');
    return deps.request(request);
  } }, { selected: ['berlin.de'] });
  assert.equal(partial[1].status, 'fresh', 'A failed later page retains successfully collected listings');
  assert.equal(partial[1].coverage[0].status, 'partial');
  assert.equal(partial[1].records.filter(item => item.kind === 'screening').length, 1);
  assert.ok(partial[1].diagnostics.some(item => item.code === 'page-failed'));
  const mixedRows = await registry.collect({ ...deps, request: async request => {
    const response = await deps.request(request);
    return { ...response, body: request.purpose || request.url.includes('startat') ? response.body
      : response.body.replace('</tbody>', '<tr><td>Do, 15.10.26</td><td>25:00 (OV)</td></tr></tbody>') };
  } }, { selected: ['berlin.de'] });
  assert.equal(mixedRows[1].records.filter(record => record.kind === 'screening').length, 1,
    'A malformed sibling does not discard the valid 20:00 Berlin row');
  assert.equal(mixedRows[1].coverage[0].status, 'partial',
    'A valid 20:00 row cannot conceal an unparsed 25:00 sibling and establish complete extraction');
  assert.ok(mixedRows[1].diagnostics.some(item => item.code === 'extraction-incomplete'));
  const mixedCritic = await registry.collect({ ...deps, request: async request => {
    const response = await deps.request(request);
    return { ...response, body: request.purpose ? response.body : critic + critic.replace('Today', 'Unknown day') };
  } }, { selected: ['critic.de'] });
  assert.equal(mixedCritic[0].coverage[0].status, 'partial',
    'Critic extraction also reports a skipped malformed date beside a valid listing');
  for (const [source, fixture, original, cells] of [
    ['berlin.de', berlin, '20:00 (OV)', ['20:00(OV),19.30(OV)', '19.30 (OV), 20:00 (OV)', '20:00 (OV) trailing']],
    ['critic.de', critic, '20:00', ['20:00,19.30', '19.30,20:00', '20:00 trailing']],
  ] as const) {
    for (const cell of cells) {
      const result = (await registry.collect({ ...deps, request: async request => {
        const response = await deps.request(request);
        return { ...response, body: request.purpose || request.url.includes('startat') ? response.body
          : fixture.replace(original, cell) };
      } }, { selected: [source] })).find(item => item.sourceInstanceId === source)!;
      assert.deepEqual(result.records.filter(record => record.kind === 'screening').map(record => record.data.time), ['20:00'],
        `${source} keeps the supported sibling without guessing an unsupported time: ${cell}`);
      assert.equal(result.coverage[0].status, 'partial', `${source} must account for the entire time cell: ${cell}`);
      assert.ok(result.diagnostics.some(item => item.code === 'extraction-incomplete'), `${source} diagnoses residue: ${cell}`);
      if (cell === cells[0]) {
        const previous = (await registry.collect({ ...deps, request: async request => {
          const response = await deps.request(request);
          return { ...response, body: request.purpose || request.url.includes('startat') ? response.body
            : fixture.replace(original, original.replace('20:00', '19:30')) };
        } }, { selected: [source] })).find(item => item.sourceInstanceId === source)!;
        const store = new PipelineStore(':memory:');
        const run = (collection: typeof result, now: string) => runPipeline({ store, collections: [collection], now,
          network: false, model: null, tmdb: null, osm: [], publish: false, audit: false });
        await run(previous, NOW);
        const later = '2026-10-15T11:00:00Z';
        const refresh = structuredClone(result);
        refresh.observedAt = later;
        for (const record of refresh.records) record.provenance.observedAt = later;
        const published = await run(refresh, later);
        assert.deepEqual(Object.keys(published.movies[0].showings['2026-10-15']).sort(), ['19:30', '20:00'],
          `${source} partial extraction cannot withdraw retained 19:30 support`);
      }
    }
  }
  for (const [source, fixture, original, cell, expected] of [
    ['berlin.de', berlin, '20:00 (OV)', '9:00 (OF), 18:40 (DFmEnglU), 21:00 (OmU)',
      [['09:00', 'OV'], ['18:40', 'OmeU'], ['21:00', 'OmU']]],
    ['critic.de', critic, '20:00', '9:00,18:40\n21:00',
      [['09:00', undefined], ['18:40', undefined], ['21:00', undefined]]],
    ['critic.de', critic, '20:00', '9:0018:40\n21:00',
      [['09:00', undefined], ['18:40', undefined], ['21:00', undefined]]],
  ] as const) {
    const result = (await registry.collect({ ...deps, request: async request => {
      const response = await deps.request(request);
      return { ...response, body: request.purpose || request.url.includes('startat') ? response.body
        : fixture.replace(original, cell) };
    } }, { selected: [source] })).find(item => item.sourceInstanceId === source)!;
    assert.deepEqual(result.records.filter(record => record.kind === 'screening').map(record => [record.data.time, record.data.variant]),
      expected, `${source} retains its supported separators, one-digit hours and variants`);
    assert.equal(result.coverage[0].status, 'complete');
    assert.ok(result.records.find(record => record.kind === 'listing')!.data.variants.includes('OV'));
    assert.ok(!result.diagnostics.some(item => item.code === 'extraction-incomplete'));
  }
  const malformedPage = await registry.collect({ ...deps, request: async request => request.url.includes('startat')
    ? { status: 200, headers: {}, body: '<ul class="js-accordion"><li>Unsupported entry</li></ul>' } : deps.request(request)
  }, { selected: ['berlin.de'] });
  assert.equal(malformedPage[1].coverage[0].status, 'partial', 'An unparsed page is not equivalent to repeated valid pagination');
  const formOnlyPage = await registry.collect({ ...deps, request: async request => request.url.includes('startat')
    ? { status: 200, headers: {}, body: '<ul class="js-accordion"><li><span class="js-accordion__trigger">Zurücksetzen</span></li></ul>' } : deps.request(request)
  }, { selected: ['berlin.de'] });
  assert.equal(formOnlyPage[1].coverage[0].status, 'complete', 'A page holding only the search form ends pagination');
  await assert.rejects(registry.collect({ ...deps, request: async request => {
    if (request.url.includes('startat')) throw new SourcePersistenceError('Fixture storage failed');
    return deps.request(request);
  } }, { selected: ['berlin.de'] }), /Fixture storage failed/,
    'A persistence error during pagination is fatal and cannot be converted into a usable partial acquisition');
  const later = '2026-10-15T11:00:00Z';
  const cachedDetails = await registry.collect({ ...deps, now: () => later });
  assert.equal(cachedDetails[0].records.find(item => item.kind === 'listing')!.data.sourceDetails.fetchedAt, NOW,
    'A new listing collection does not renew cached optional detail evidence');
  const forcedDetails = await registry.collect({ ...deps, now: () => later, force: true });
  assert.equal(forcedDetails[0].records.find(item => item.kind === 'listing')!.data.sourceDetails.fetchedAt, later,
    'Force refresh retrieves optional evidence using the injected clock');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-retained-adapters-'));
  try {
    const raw = { title: 'Retained Film', rawTitle: 'Retained Film', url: 'https://www.critic.de/movie/retained-film/',
      director: 'A Director', year: '2026', variants: ['OV'],
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-15', time: '20:00' }] };
    const oldTime = '2026-10-15T09:00:00Z';
    const execute = (input: any) => runPipeline({ store: new PipelineStore(':memory:'), now: NOW, network: false,
      sourceRegistry: registry, osm: [], model: null, tmdb: null, publish: false, audit: false, ...input });
    const legacy = await execute({ collections: [translateLegacyBatch({ source: 'critic.de', movies: [raw], status: 'cached', complete: false, observedAt: oldTime })] });
    fs.writeFileSync(path.join(root, 'critic-raw.json'), JSON.stringify({ movies: [raw], scrapedAt: oldTime, complete: true }));
    const retained = await registry.collect(retainedDependencies(new PipelineStore(':memory:'), registry,
      { dataDir: root, network: false, now: NOW }), { retained: true });
    assert.equal(retained[0].observedAt, oldTime, 'Old raw caches retain their actual observation time');
    const migrated = await execute({ collections: retained });
    assert.equal(migrated.movies[0].id, legacy.movies[0].id);
    assert.equal(migrated.movies[0].slug, legacy.movies[0].slug);
    assert.deepEqual(migrated.movies[0].showings, legacy.movies[0].showings);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  console.log('captured critic.de and berlin.de adapter collections reach public snapshots');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
