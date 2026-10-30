import assert from 'assert/strict';
import { CachedFilmEvidence, corroboratedTitleExtension, supportsFilmIdentity } from './identity-evidence';
import { identityConflict } from './resolve';
import { PipelineStore } from './store';
import { runPipeline } from './pipeline';
import { translateLegacyBatch } from './observations';
import { tmdbMovieData } from '../tmdb-client';
import { fingerprint, normalize } from './domain';
import { filmMetadataInput } from './identity-evidence';
import { cachedDirectorAliases } from './person-aliases';

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
  assert.equal(normalize('Catli 2'), normalize('Çatlı 2'), 'Turkish dotless i is transliterated, never deleted');
  assert.equal(normalize('ÇATLI 2'), normalize('Çatlı 2'));
  assert.notEqual(normalize('Catli 2'), normalize('Çatlı'), 'Sequel numbers remain part of identity');
  assert.equal(supportsFilmIdentity(listing, provider), true);
  assert.equal(supportsFilmIdentity({ title: 'GUTS - A female Expedition through Africa + Her Wave',
    year: 2026, director: 'Patrizia Bruno, Luigi Rapanelli' },
  { title: 'GUTS: A Female Expedition Through Africa', year: 2026, director: 'Patrizia Bruno' }), false,
  'A component film must not supply the identity of a combined screening');
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

  const aliasStore = new PipelineStore(':memory:');
  const aliasBundle = { credits: { crew: [{ id: 1820858, job: 'Director', name: 'Caroline Kox' }] } };
  aliasStore.saveResource('tmdb-person:1820858', { id: 999, name: 'Caroline Kox', also_known_as: ['Koxi'] }, NOW);
  assert.deepEqual(cachedDirectorAliases(aliasStore, aliasBundle, NOW), [], 'An alias must belong to the credited person ID');
  aliasStore.saveResource('tmdb-person:1820858', { id: 1820858, name: 'Caroline Kox', also_known_as: ['Koxi'] }, '2026-10-01T10:00:00Z');
  assert.deepEqual(cachedDirectorAliases(aliasStore, aliasBundle, NOW), [], 'Expired alias evidence is withheld');

  const scenarios = {
    'omitted-title-article': {
      raw: { title: 'Texas Chainsaw Massacre', year: 1974, director: 'Tobe Hooper' },
      data: { details: { id: 620, title: 'The Texas Chainsaw Massacre', release_date: '1974-10-11' },
        credits: { cast: [], crew: [{ name: 'Tobe Hooper', job: 'Director' }] } },
    },
    'descriptive-subtitle': {
      raw: { title: 'Mein neues altes Ich - Eine Reise in das Mysterium der Menopause', year: 2026,
        director: 'Louise Unmack Kjeldsen', runtime: 75, country: 'Dänemark' },
      data: { details: { id: 620, title: 'Menopause Mystery', original_title: 'Mysteriet om Menopausen',
        release_date: '2026-03-12', runtime: 74, production_countries: [{ iso_3166_1: 'DK', name: 'Denmark' }] },
        translations: { translations: [{ iso_639_1: 'de', data: { title: 'Mein neues altes Ich' } }] },
        credits: { cast: [], crew: [{ name: 'Louise Unmack Kjeldsen', job: 'Director' }] } },
    },
    'live-viewing-suffix': {
      raw: { title: "BTS World Tour 'ARIRANG' in São Paulo: Live Viewing", year: 2026, director: 'Jungjae Ha', runtime: 195 },
      data: { details: { id: 620, title: 'BTS WORLD TOUR [ARIRANG] in São Paulo', release_date: '2026-10-30', runtime: 195 },
        credits: { cast: [], crew: [{ name: 'Ha Jung-jae', job: 'Director' }] } },
    },
    'one-actor': { raw: listing, data: bundle(620) },
    'transliterated-director': { raw: minotaurus,
      data: { details: { id: 620, title: 'Minotaurus', original_title: 'Minotaurus', release_date: '2026-11-05', runtime: 141 },
        credits: { cast: [], crew: [{ name: 'Andrei Zvyagintsev', job: 'Director' }] } } },
    'turkish-title': {
      raw: { title: 'Catli 2', year: 2026, director: 'Deniz Enyüksek', runtime: 118, country: 'Türkei', cast: ['Vedat Inceefe', 'Eren Vurdem', 'Ömer Kurt'] },
      data: { details: { id: 620, title: 'Çatlı 2', original_title: 'Çatlı 2', release_date: '2026-10-29', runtime: 118, poster_path: '/catli-2.jpg' },
        credits: { cast: [{ name: 'Vedat İnceefe' }, { name: 'Eren Vurdem' }, { name: 'Ömer Kurt' }], crew: [{ name: 'Deniz Enyüksek', job: 'Director' }] } },
    },
    'latin-ligature-title-and-credits': {
      raw: { title: 'Coeur', year: 2026, director: 'Soren Larsen' },
      data: { details: { id: 620, title: 'Cœur', original_title: 'Cœur', release_date: '2026-01-01' },
        credits: { cast: [], crew: [{ name: 'Søren Larsen', job: 'Director' }] } },
    },
    'non-latin-title': {
      raw: { title: '東京', year: 2026, director: '李安' },
      data: { details: { id: 620, title: '東京', original_title: '東京', release_date: '2026-01-01' },
        credits: { cast: [], crew: [{ name: '李安', job: 'Director' }] } },
    },
    'hyphenated-korean-director': {
      raw: { title: 'HYBE Cheering Party', year: 2026, director: 'Sanggeun Park, Jineui Kim', runtime: 60 },
      data: { details: { id: 620, title: 'HYBE CHEERING PARTY', original_title: '하이브 치어링 파티', release_date: '2026-10-24', runtime: 60 },
        credits: { cast: [], crew: [{ name: 'Park Sang-geun', job: 'Director' }, { name: 'Kim Jin-eui', job: 'Director' }] } },
    },
    'provider-director-alias': {
      raw: { title: 'Liebhaberinnen', year: 2026, director: 'Koxi', runtime: 98, cast: ['Johanna Wokalek', 'Hannah Schiller'] },
      data: { details: { id: 620, title: 'Women as Lovers', original_title: 'Liebhaberinnen', release_date: '2026-10-22', runtime: 98 },
        credits: { cast: [{ name: 'Johanna Wokalek' }, { name: 'Hannah Schiller' }], crew: [{ id: 1820858, name: 'Caroline Kox', job: 'Director' }] } },
    },
    'one-year-leeway-with-credits': {
      raw: { title: 'Die Teufel', year: 1970, director: 'Ken Russell', runtime: 111 },
      data: { details: { id: 620, title: 'The Devils', original_title: 'The Devils', release_date: '1971-07-16', runtime: 112 },
        translations: { translations: [{ iso_639_1: 'de', data: { title: 'Die Teufel' } }] },
        credits: { cast: [], crew: [{ name: 'Ken Russell', job: 'Director' }] } },
    },
  };
  const subtitle = scenarios['descriptive-subtitle'];
  const projected = { ...tmdbMovieData(subtitle.data), year: 2026, title: 'Menopause Mystery' };
  assert.equal(corroboratedTitleExtension(subtitle.raw, projected), true);
  for (const patch of [{ director: 'Another Director' }, { runtime: 95 }, { year: 2025 }, { country: 'Japan' }, { runtime: null }])
    assert.equal(corroboratedTitleExtension({ ...subtitle.raw, ...patch }, projected), false, JSON.stringify(patch));
  const subtitleStore = new PipelineStore(':memory:');
  subtitleStore.saveResource('tmdb-detail:620', subtitle.data, NOW);
  const subtitleCache = new CachedFilmEvidence(subtitleStore, NOW);
  assert.equal(subtitleCache.match(subtitle.raw)?.id, 620);
  for (const patch of [{ runtime: 95 }, { year: 2025 }, { country: 'Japan' }, { runtime: null }])
    assert.equal(subtitleCache.match({ ...subtitle.raw, ...patch }), null, 'Cached title extensions require the same corroboration: ' + JSON.stringify(patch));
  for (const [scenario, { raw, data }] of Object.entries(scenarios)) for (const mode of ['cached', 'retrieved', 'ambiguous'] as const)
    for (const lineage of [['berlin.de'], ['TMDb:620'], []]) {
    const pipelineStore = new PipelineStore(':memory:');
    const candidates = mode === 'ambiguous' ? [data, { ...data, details: { ...data.details, id: 621 } }] : [data];
    if (mode !== 'retrieved') for (const candidate of candidates)
      pipelineStore.saveResource(`tmdb-detail:${candidate.details.id}`, candidate, NOW);
    if (scenario === 'provider-director-alias' && mode !== 'retrieved')
      pipelineStore.saveResource('tmdb-person:1820858', { id: 1820858, name: 'Caroline Kox', also_known_as: ['Koxi'] }, NOW);
    const aliasCalls: number[] = [];
    const tmdb: any = { candidates: async () => candidates.map(candidate => candidate.details),
      getMovieDetails: async (id: number) => candidates.find(candidate => candidate.details.id === id),
      enrichSelected: async (id: number) => tmdbMovieData(candidates.find(candidate => candidate.details.id === id)),
      getPersonAliases: async (id: number) => { aliasCalls.push(id); return { id, name: 'Caroline Kox', also_known_as: ['Koxi'] }; } };
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
    if (scenario === 'provider-director-alias' && mode === 'retrieved' && lineage[0] === 'berlin.de')
      assert.deepEqual(aliasCalls, [1820858], 'Fetch only the mismatched credited person, once');
    if (scenario === 'provider-director-alias' && mode === 'retrieved' && lineage[0] === 'berlin.de') {
      pipelineStore.saveResource('tmdb-person:1820858', { id: 1820858, name: 'Caroline Kox', also_known_as: ['Koxi'] }, '2026-10-01T10:00:00Z');
      const refreshed = await runPipeline({ store: pipelineStore, collections: [collection], now: NOW,
        network: false, tmdb, model: null, publish: false, audit: false,
        osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }] });
      assert.equal(refreshed.movies[0].identityStatus, 'verified', 'Refresh aliases on accepted matches when the person cache expires');
      assert.deepEqual(aliasCalls, [1820858, 1820858]);
    }
  }
  const duplicateStore = new PipelineStore(':memory:');
  duplicateStore.saveResource('tmdb-detail:1797226', { ...scenarios['hyphenated-korean-director'].data,
    details: { ...scenarios['hyphenated-korean-director'].data.details, id: 1797226 } }, NOW);
  const duplicateCollection: any = translateLegacyBatch({ source: 'berlin.de', status: 'fresh', complete: true, observedAt: NOW,
    movies: [false, true].map(threeD => ({ ...scenarios['hyphenated-korean-director'].raw,
      title: `HYBE Cheering Party${threeD ? ' 3D' : ''}`, sourceId: threeD ? 'hybe-3d' : 'hybe-2d',
      url: `https://www.berlin.de/kino/_bin/filmdetail.php/${threeD ? '317408' : '316969'}`,
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-30', time: threeD ? '22:00' : '20:00', variant: 'OmU' }] })) });
  for (const record of duplicateCollection.records) record.provenance.upstreamLineage = ['berlin.de'];
  const duplicateSnapshot = await runPipeline({ store: duplicateStore, collections: [duplicateCollection], now: NOW,
    network: false, tmdb: null, model: null, publish: false, audit: false,
    osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }] });
  assert.equal(duplicateSnapshot.movies.length, 1, 'Verified HYBE 2D/3D listings describe one film');
  assert.deepEqual(Object.keys(duplicateSnapshot.movies[0].showings['2026-10-30']).sort(), ['20:00', '22:00'], 'Both screening formats keep their showtimes');
  assert.equal(duplicateSnapshot.movies[0].showings['2026-10-30']['20:00'][0].modality.projection.includes('3D'), false);
  assert.equal(duplicateSnapshot.movies[0].showings['2026-10-30']['22:00'][0].modality.projection.includes('3D'), true);
  assert.equal(duplicateSnapshot.movies[0].sourceSubjects.length, 2, 'Both original listing records remain attributed');
  const reviewedStore = new PipelineStore(':memory:');
  reviewedStore.saveResource('tmdb-detail:1604480', { details: { id: 1604480, title: 'Barbara Buser', original_title: 'Barbara Buser',
    release_date: '2026-04-16', runtime: 117, poster_path: '/barbara.jpg' },
    credits: { cast: [{ name: 'Barbara Buser' }], crew: [{ name: 'Gabriele Schärer', job: 'Director' }] } }, NOW);
  const reviewedCollection: any = translateLegacyBatch({ source: 'berlin.de', status: 'fresh', complete: true, observedAt: NOW,
    movies: [{ title: 'Barbara Buser', director: 'Gabriela Schärer', year: 2025, runtime: 120,
      sourceId: 'barbara', url: 'https://www.berlin.de/kino/_bin/filmdetail.php/313025',
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-30', time: '20:00', variant: 'OV' }] }] });
  for (const record of reviewedCollection.records) record.provenance.upstreamLineage = ['berlin.de'];
  const replayReviewed = () => runPipeline({ store: reviewedStore, collections: [reviewedCollection], now: NOW,
    network: false, tmdb: null, model: null, publish: false, audit: false,
    osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }] });
  const beforeReview = await replayReviewed();
  assert.equal(beforeReview.movies[0].identityStatus, 'source-only', 'Do not automatically equate different given names');
  const entity = reviewedStore.entity(beforeReview.movies[0].id)!;
  reviewedStore.addOverride({ subject: `metadata:${entity.id}`, action: 'patch', patch: { tmdbId: 1604480 },
    actor: 'test reviewer', reason: 'Reviewed against the distributor; production 2025, release 2026, source given-name typo',
    evidenceFingerprint: fingerprint(filmMetadataInput(entity)) });
  const afterReview = await replayReviewed();
  assert.equal(afterReview.movies[0].identityStatus, 'verified', 'An explicit compatible review resolves the source credit discrepancy');
  assert.ok(reviewedStore.issues().some(issue => issue.details.resolutionCode === 'reviewed-provider-credit-difference' && issue.status === 'caution'));
  for (const record of reviewedCollection.records) if (record.kind === 'listing') {
    record.data.year = 2023; record.fields.year = { state: 'known', value: 2023 };
  }
  assert.equal((await replayReviewed()).movies[0].identityStatus, 'source-only', 'A changed source year cannot reuse the earlier review');
  const originalStore = new PipelineStore(':memory:');
  originalStore.saveResource('tmdb-detail:162505', { details: { id: 162505, title: 'One Way or Another',
    original_title: 'De cierta manera', release_date: '1977-06-01', runtime: 73 },
  credits: { cast: [{ name: 'Mario Balmaseda' }, { name: 'Yolanda Cuéllar' }], crew: [{ job: 'Director', name: 'Sara Gómez' }] } }, NOW);
  const originalCollection: any = translateLegacyBatch({ source: 'berlin.de', status: 'fresh', complete: true, observedAt: NOW,
    movies: [{ title: 'In gewisser Hinsicht', year: 1974, director: 'Sara Gomez', cast: ['Mario Balmaseda', 'Yolanda Cuellar'],
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-30', time: '20:00' }] }] });
  for (const record of originalCollection.records) record.provenance.upstreamLineage = ['berlin.de'];
  const replayOriginal = () => runPipeline({ store: originalStore, collections: [originalCollection], now: NOW,
    network: false, tmdb: null, model: null, publish: false, audit: false,
    osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin', insideBerlin: true, website: null }] });
  const originalBefore = await replayOriginal();
  assert.equal(originalBefore.movies[0].identityStatus, 'source-only');
  originalStore.addOverride({ subject: `entity:${originalBefore.movies[0].id}`, action: 'patch',
    patch: { fields: { originalTitle: 'De cierta manera' } }, actor: 'test reviewer',
    evidenceFingerprint: 'reviewed-source-original-title',
    reason: 'Original title confirmed against the screening institution' });
  const originalAfter = await replayOriginal();
  assert.equal(originalAfter.movies[0].identityStatus, 'verified', 'A reviewed original title corroborates the independently supplied director and two actors');
  assert.equal(originalAfter.movies[0].year, 1977);
  console.log('identity-evidence tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
