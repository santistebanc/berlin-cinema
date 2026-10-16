import assert from 'assert/strict';
import axios from 'axios';
import { fetchOmdbData } from './omdb-client';

async function main() {
  const get = axios.get; let requests = 0;
  const response = { Response: 'True', imdbID: 'tt1234567', Type: 'movie', Title: 'A Film', Year: '2026',
    Released: '17 Jul 2026', Director: 'Director A', Actors: 'Actor A, Actor B', Writer: 'Writer A',
    Country: 'Germany, France', Language: 'German, French', Genre: 'Drama, Comedy', Runtime: '101 min',
    Plot: 'A complete plot', Poster: 'https://example.test/poster.jpg', Rated: 'PG-13', Awards: 'An award',
    imdbRating: '0.0', imdbVotes: '0', Metascore: '0', Ratings: [{ Source: 'Rotten Tomatoes', Value: '90%' }] };
  try {
    (axios as any).get = async (_: string, options: any) => {
      requests++; assert.equal(options.params.plot, 'full', 'Retain the full plot in the existing exact-ID lookup');
      return { data: response };
    };
    const data = await fetchOmdbData('tt1234567', 'test-only');
    assert.equal(data!.imdbRating, 0); assert.equal(data!.imdbVotes, 0);
    assert.equal((data as any).metadata.director, 'Director A');
    assert.equal((data as any).metadata.country, 'Germany, France');
    assert.deepEqual((data as any).metadata.spokenLanguages, [{ code: null, name: 'German' }, { code: null, name: 'French' }]);
    assert.equal((data as any).metadata.runtime, 101); assert.equal((data as any).metadata.plot, 'A complete plot');
    assert.equal((data as any).raw.Awards, 'An award', 'Preserve complete provider evidence');
    (axios as any).get = async () => ({ data: { ...response, imdbID: 'tt7654321' } });
    assert.equal(await fetchOmdbData('tt1234567', 'test-only'), null, 'Reject responses for a different external identity');
    (axios as any).get = async () => ({ data: { ...response, Type: 'series' } });
    assert.equal(await fetchOmdbData('tt1234567', 'test-only'), null);
    assert.equal(requests, 1);
    console.log('omdb-client evidence retrieval tests passed');
  } finally { axios.get = get; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
