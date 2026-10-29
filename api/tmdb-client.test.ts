import assert from 'assert/strict';
import axios from 'axios';
import TmdbClient, { tmdbMovieData } from './tmdb-client';

async function main() {
  const original = axios.get; const searches: any[] = []; const details: any[] = [];
  try {
    (axios as any).get = async (url: string, options: any) => {
      if (url.includes('/search/movie')) { searches.push(options.params); return { data: { results: [
        { id: 1997, title: 'The Odyssey', original_title: 'The Odyssey', release_date: '1997-01-01' },
        { id: 2026, title: 'The Odyssey', original_title: 'The Odyssey', release_date: '2026-01-01' },
      ] } }; }
      assert.ok(url.endsWith('/movie/2026'), 'Only the externally selected identity can supply enrichment');
      details.push(options.params);
      return { data: { id: 2026, title: 'The Odyssey', original_title: 'Original source title', release_date: '2026-07-17',
        overview: 'A plot', runtime: 120, vote_average: 0, vote_count: 0, poster_path: null,
        production_countries: [{ iso_3166_1: 'GB', name: 'United Kingdom' }, { iso_3166_1: 'US', name: 'United States of America' }],
        spoken_languages: [{ iso_639_1: 'en', english_name: 'English', name: 'English' }],
        credits: { crew: [{ job: 'Director', name: 'Christopher Nolan' }, { job: 'Director', name: 'Co-director' }], cast: [{ name: 'First', order: 0 }] },
        translations: { translations: [{ name: 'German', data: { title: 'Die Odyssee' } }] },
        alternative_titles: { titles: [{ iso_3166_1: 'DE', title: 'Official alternative title', type: '' }] },
        release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13', type: 3, release_date: '2026-07-17T00:00:00Z' }] }] },
        images: { posters: [], backdrops: [] },
        external_ids: { imdb_id: 'tt1234567', wikidata_id: 'Q123' }, videos: { results: [{ type: 'Trailer', site: 'YouTube', key: 'unofficial', official: false }, { type: 'Trailer', site: 'YouTube', key: 'abc', official: true }] },
      } };
    };
    const client = new TmdbClient('test-only'); const candidates = await client.candidates(['Die Odyssee', 'The Odyssey']);
    assert.equal(candidates.length, 2, 'Keep distinct candidate IDs; do not select the first search result');
    assert.equal(searches.length, 4); assert.ok(searches.some(p => p.language === 'de-DE')); assert.ok(searches.some(p => p.query === 'The Odyssey'));
    const result = await client.enrichSelected(2026);
    assert.ok(details[0].append_to_response.includes('alternative_titles'), 'Collect official alternative titles in the same detail request');
    assert.ok(details[0].append_to_response.includes('images'));
    assert.equal(result!.director, 'Christopher Nolan, Co-director'); assert.equal(result!.originalTitle, 'Original source title');
    assert.deepEqual(result!.alternativeTitles, ['Die Odyssee', 'Official alternative title'], 'Keep both translated and official alternative titles');
    assert.equal((result as any).country, 'United Kingdom, United States of America');
    assert.deepEqual((result as any).directors, ['Christopher Nolan', 'Co-director']);
    assert.equal((result as any).spokenLanguages[0].code, 'en');
    assert.equal((result as any).releaseDate, '2026-07-17');
    assert.equal(result!.ageRating, null, 'A US certificate must never be displayed as a German FSK rating');
    assert.equal(result!.rating, 0, 'Zero is not missing'); assert.equal(result!.posterUrl, null);
    assert.equal(result!.trailerUrl, 'https://www.youtube.com/watch?v=abc');
    const bundle = await client.getMovieDetails(2026); const requestsBeforeReuse = details.length;
    await client.enrichSelected(2026, undefined, '', bundle);
    assert.equal(details.length, requestsBeforeReuse, 'Reuse a verified detail bundle instead of requesting the same movie again');
    assert.equal(bundle.credits.crew.length, 2, 'Full credits are retained independently of the compact display projection');
    const german = tmdbMovieData({ ...bundle, releaseDates: [{ iso_3166_1: 'DE', release_dates: [
      { certification: '16', type: 4, release_date: '2026-08-01T00:00:00Z' },
      { certification: '12', type: 3, release_date: '2026-07-16T00:00:00Z' },
    ] }] });
    assert.equal(german.ageRating, '12'); assert.equal(german.germanReleaseDate, '2026-07-16');
    (axios as any).get = async () => ({ data: { results: [
      ...Array.from({ length: 6 }, (_, index) => ({ id: index + 1, title: `Partial Title ${index}`, original_title: `Partial Title ${index}` })),
      { id: 2001, title: 'Monsters, Inc.', original_title: 'Monsters, Inc.' },
    ] } });
    const lowRankedExact = await new TmdbClient('test-only').candidates(['Monsters, Inc.']);
    assert.ok(lowRankedExact.some(candidate => candidate.id === 2001), 'A whole-title match below the top five must remain a candidate');
    for (const [query, title] of [['Catli 2', 'Çatlı 2'], ['Aeon Flux', 'Æon Flux'], ['Coeur', 'Cœur'], ['東京', '東京']]) {
      (axios as any).get = async () => ({ data: { results: [
        ...Array.from({ length: 6 }, (_, index) => ({ id: index + 1, title: `Other Film ${index}`, original_title: `Other Film ${index}` })),
        { id: 1786633, title, original_title: title },
      ] } });
      assert.ok((await new TmdbClient('test-only').candidates([query])).some(candidate => candidate.id === 1786633),
        `Normalized exact titles below the top five must remain candidates: ${query} / ${title}`);
    }
    (axios as any).get = async () => ({ data: { id: 1820858, name: 'Caroline Kox', also_known_as: ['Koxi', null] } });
    assert.deepEqual(await new TmdbClient('test-only').getPersonAliases(1820858), { id: 1820858, name: 'Caroline Kox', also_known_as: ['Koxi'] });
    assert.equal(await new TmdbClient('test-only').getPersonAliases(123), null, 'Reject aliases returned for a different person ID');
    (axios as any).get = async () => { throw { response: { status: 503 } }; };
    const unavailable = new TmdbClient('test-only');
    assert.deepEqual(await unavailable.candidates(['Unreachable']), []);
    assert.deepEqual(unavailable.retrievalErrors().map(error => error.status), [503, 503], 'Keep retrieval failures distinct from successful searches with no candidates');
    console.log('tmdb-client evidence retrieval tests passed');
  } finally { axios.get = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
