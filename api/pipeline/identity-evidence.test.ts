import assert from 'assert/strict';
import { CachedFilmEvidence, supportsFilmIdentity } from './identity-evidence';
import { identityConflict } from './resolve';
import { PipelineStore } from './store';
import { runPipeline } from './pipeline';
import { translateLegacyBatch } from './observations';
import { tmdbMovieData } from '../tmdb-client';

const NOW = '2026-10-29T10:00:00Z';
const listing = { title: 'Ghostbusters', year: 1984, cast: ['Bill Murray'], runtime: 105, country: 'USA' };
const provider = { ...listing, director: 'Ivan Reitman', country: 'United States of America',
  productionCountries: [{ code: 'US', name: 'United States of America' }] };
const minotaurus = { title: 'Minotaurus', year: 2026, director: 'Andreï Zviaguintsev', runtime: 141 };
const minotaurProvider = { ...minotaurus, director: 'Andrei Zvyagintsev' };

function bundle(id: number, values: any = {}) {
  return { details: { id, title: 'Ghostbusters', original_title: 'Ghostbusters', release_date: '1984-06-08', runtime: 105,
    production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }], poster_path: '/poster.jpg', ...values },
    credits: { cast: [{ name: 'Bill Murray' }], crew: [{ name: 'Ivan Reitman', job: 'Director' }] } };
}
async function main() {
  assert.equal(supportsFilmIdentity(listing, provider), true);
  for (const patch of [{ runtime: null }, { runtime: 115 }, { edition: 'Extended cut' }, { country: null }, { country: 'Japan' },
    { cast: ['Dan Aykroyd'] }, { year: 2016 }, { year: 1985 }, { title: 'Ghostbusters II' }]) {
    assert.equal(supportsFilmIdentity({ ...listing, ...patch }, provider), false, JSON.stringify(patch));
  }
  assert.equal(supportsFilmIdentity({ ...listing, country: 'Deutschland' }, { ...provider, country: 'Germany',
    productionCountries: [{ code: 'DE', name: 'Germany' }] }), true, 'Country codes bridge translated country labels');
  assert.equal(supportsFilmIdentity(minotaurus, minotaurProvider), true);
  assert.equal(identityConflict(minotaurus, minotaurProvider), false);
  for (const patch of [{ runtime: null }, { runtime: 150 }, { title: 'Another Film' }, { year: 2025 }]) {
    assert.equal(supportsFilmIdentity({ ...minotaurus, ...patch }, minotaurProvider), false);
    assert.equal(identityConflict({ ...minotaurus, ...patch }, minotaurProvider), true);
  }
  assert.equal(identityConflict(minotaurus, { ...minotaurProvider, director: 'Andrei Konchalovsky' }), true,
    'A different complete director name still conflicts');
  const store = new PipelineStore(':memory:');
  store.saveResource('tmdb-detail:620', bundle(620), NOW);
  const cached = new CachedFilmEvidence(store, NOW);
  assert.equal(cached.match(listing)?.id, 620);
  assert.equal(cached.match({ ...listing, runtime: 115 }), null, 'Memoization includes supplemental evidence');
  store.saveResource('tmdb-detail:621', bundle(621), NOW);
  assert.equal(new CachedFilmEvidence(store, NOW).match(listing), null, 'Two supported candidates require review');

  for (const scenario of ['one-actor', 'transliterated-director'] as const) for (const mode of ['cached', 'retrieved', 'ambiguous'] as const)
    for (const lineage of [['berlin.de'], ['TMDb:620'], []]) {
    const pipelineStore = new PipelineStore(':memory:');
    const raw = scenario === 'one-actor' ? listing : minotaurus;
    const data = scenario === 'one-actor' ? bundle(620) : { details: { id: 620, title: 'Minotaurus', original_title: 'Minotaurus',
      release_date: '2026-11-05', runtime: 141 }, credits: { cast: [], crew: [{ name: 'Andrei Zvyagintsev', job: 'Director' }] } };
    const candidates = mode === 'ambiguous' ? [data, { ...data, details: { ...data.details, id: 621 } }] : [data];
    if (mode !== 'retrieved') for (const candidate of candidates)
      pipelineStore.saveResource(`tmdb-detail:${candidate.details.id}`, candidate, NOW);
    const tmdb: any = { candidates: async () => candidates.map(candidate => candidate.details),
      getMovieDetails: async (id: number) => candidates.find(candidate => candidate.details.id === id),
      enrichSelected: async (id: number) => tmdbMovieData(candidates.find(candidate => candidate.details.id === id)) };
    const collection: any = translateLegacyBatch({ source: 'berlin.de', status: 'fresh', complete: true, observedAt: NOW,
      movies: [{ ...raw, plot: 'An independently supplied synopsis.', sourceId: 'film', url: 'https://www.berlin.de/kino/_bin/filmdetail.php/74451',
        cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
        showings: [{ cinema: 'Example Cinema', date: '2026-10-30', time: '20:00', variant: 'OV' }] }] });
    for (const record of collection.records) record.provenance.upstreamLineage = lineage;
    const snapshot = await runPipeline({ store: pipelineStore, collections: [collection], now: NOW,
      network: false, tmdb: mode === 'cached' ? null : tmdb, model: null, publish: false, audit: false,
      osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }] });
    const verified = lineage[0] === 'berlin.de' && mode !== 'ambiguous';
    assert.equal(snapshot.movies[0].identityStatus, verified ? 'verified' : 'source-only',
      `${scenario}/${mode}/${lineage}: only unique independent evidence may establish the provider match`);
    assert.equal(pipelineStore.entity(snapshot.movies[0].id)?.data.tmdbId ?? null, verified ? 620 : null);
    assert.equal(snapshot.movies[0].plot, 'An independently supplied synopsis.', 'Source descriptions survive without a provider match');
  }
  console.log('identity-evidence tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
