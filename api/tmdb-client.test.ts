import assert from 'assert';
import axios from 'axios';
import TmdbClient from './tmdb-client';

const originalGet = axios.get;

function movieDetails(id: number, director: string) {
  const isNolanOdyssey = id === 2026;
  const isSpaceOdyssey = id === 2001;
  return {
    id,
    title: isNolanOdyssey ? 'The Odyssey' : id === 3000 ? 'Die Odyssee der Kinder' : isSpaceOdyssey ? '2001: A Space Odyssey' : 'The Odyssey',
    overview: '',
    tagline: null,
    runtime: 120,
    vote_average: 0,
    vote_count: 0,
    release_date: isNolanOdyssey || id === 3000 ? '2026-07-17' : isSpaceOdyssey ? '1968-04-02' : '1997-05-18',
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

async function testEnrichSearchesAltTitleBeforeAcceptingGermanFalsePositive() {
  (axios as any).get = async (url: string, opts?: { params?: { query?: string } }) => {
    if (url.includes('/search/movie')) {
      const query = opts?.params?.query;
      if (query === 'Die Odyssee') {
        return {
          data: {
            results: [
              {
                id: 3000,
                title: 'Die Odyssee der Kinder',
                original_title: 'Die Odyssee der Kinder',
                release_date: '2026-04-01',
                poster_path: '/children.jpg',
                overview: 'Wrong German-title match',
                genre_ids: [],
                original_language: 'de',
                vote_average: 0,
                vote_count: 1,
                popularity: 8,
              },
            ],
          },
        };
      }

      if (query === 'The Odyssey') {
        return {
          data: {
            results: [
              {
                id: 2026,
                title: 'The Odyssey',
                original_title: 'The Odyssey',
                release_date: '2026-07-17',
                poster_path: '/nolan.jpg',
                overview: 'Nolan adaptation',
                genre_ids: [],
                original_language: 'en',
                vote_average: 0,
                vote_count: 1,
                popularity: 6,
              },
            ],
          },
        };
      }
    }

    if (url.includes('/movie/3000')) return { data: movieDetails(3000, 'Teresina Moscatiello') };
    if (url.includes('/movie/2026')) return { data: movieDetails(2026, 'Christopher Nolan') };

    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const client = new TmdbClient('test-key');
    const result = await client.enrichMovie('Die Odyssee', 'The Odyssey', {
      year: 2026,
      director: 'Christopher Nolan',
    });

    assert.equal(result?.tmdbTitle, 'The Odyssey');
    assert.equal(result?.director, 'Christopher Nolan');
  } finally {
    (axios as any).get = originalGet;
  }
}

async function testEnrichSearchesLocalizedTitlesForGermanReleaseNames() {
  (axios as any).get = async (url: string, opts?: { params?: { query?: string; language?: string } }) => {
    if (url.includes('/search/movie')) {
      const query = opts?.params?.query;
      const language = opts?.params?.language;
      if (query === '2001: Odyssee im Weltraum' && language === 'en-US') {
        return {
          data: {
            results: [
              {
                id: 4000,
                title: 'Von Shining bis 2001 – Odyssee im Weltraum',
                original_title: 'Von Shining bis 2001 – Odyssee im Weltraum',
                release_date: '2019-01-01',
                poster_path: '/doc.jpg',
                overview: 'Wrong documentary match',
                genre_ids: [],
                original_language: 'de',
                vote_average: 0,
                vote_count: 1,
                popularity: 7,
              },
            ],
          },
        };
      }

      if (query === '2001: Odyssee im Weltraum' && language === 'de-DE') {
        return {
          data: {
            results: [
              {
                id: 2001,
                title: '2001: Odyssee im Weltraum',
                original_title: '2001: A Space Odyssey',
                release_date: '1968-04-02',
                poster_path: '/space.jpg',
                overview: 'Kubrick film',
                genre_ids: [],
                original_language: 'en',
                vote_average: 8,
                vote_count: 1000,
                popularity: 20,
              },
            ],
          },
        };
      }
    }

    if (url.includes('/movie/4000')) return { data: movieDetails(4000, 'Christian Leblé') };
    if (url.includes('/movie/2001')) return { data: movieDetails(2001, 'Stanley Kubrick') };

    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const client = new TmdbClient('test-key');
    const result = await client.enrichMovie('2001: Odyssee im Weltraum');

    assert.equal(result?.tmdbTitle, '2001: A Space Odyssey');
    assert.equal(result?.director, 'Stanley Kubrick');
  } finally {
    (axios as any).get = originalGet;
  }
}

Promise.resolve()
  .then(testSearchUsesYearAndDirectorForAmbiguousExactTitles)
  .then(testEnrichSearchesAltTitleBeforeAcceptingGermanFalsePositive)
  .then(testEnrichSearchesLocalizedTitlesForGermanReleaseNames)
  .then(() => console.log('tmdb-client tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
