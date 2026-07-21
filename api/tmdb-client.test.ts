import assert from 'assert';
import axios from 'axios';
import TmdbClient from './tmdb-client';

const originalGet = axios.get;

function movieDetails(id: number, director: string) {
  return {
    id,
    title: 'The Odyssey',
    overview: '',
    tagline: null,
    runtime: 120,
    vote_average: 0,
    vote_count: 0,
    release_date: id === 2026 ? '2026-07-17' : '1997-05-18',
    poster_path: null,
    backdrop_path: null,
    genres: [],
    original_language: 'en',
    credits: { crew: [{ job: 'Director', name: director }], cast: [] },
    videos: { results: [] },
    external_ids: {},
    release_dates: { results: [] },
    keywords: { keywords: [] },
    translations: { translations: [] },
  };
}

async function testSearchUsesYearAndDirectorForAmbiguousExactTitles() {
  (axios as any).get = async (url: string) => {
    if (url.includes('/search/movie')) {
      return {
        data: {
          results: [
            {
              id: 1997,
              title: 'The Odyssey',
              original_title: 'The Odyssey',
              release_date: '1997-05-18',
              poster_path: '/old.jpg',
              overview: 'Older adaptation',
              genre_ids: [],
              original_language: 'en',
              vote_average: 6,
              vote_count: 100,
              popularity: 10,
            },
            {
              id: 2026,
              title: 'The Odyssey',
              original_title: 'The Odyssey',
              release_date: '2026-07-17',
              poster_path: '/new.jpg',
              overview: 'Nolan adaptation',
              genre_ids: [],
              original_language: 'en',
              vote_average: 8,
              vote_count: 10,
              popularity: 8,
            },
          ],
        },
      };
    }

    if (url.includes('/movie/1997')) return { data: movieDetails(1997, 'Andrei Konchalovsky') };
    if (url.includes('/movie/2026')) return { data: movieDetails(2026, 'Christopher Nolan') };

    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const client = new TmdbClient('test-key');
    const result = await client.searchMovie('The Odyssey', {
      year: 2026,
      director: 'Christopher Nolan',
    });

    assert.equal(result?.id, 2026);
  } finally {
    (axios as any).get = originalGet;
  }
}

testSearchUsesYearAndDirectorForAmbiguousExactTitles()
  .then(() => console.log('tmdb-client tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
