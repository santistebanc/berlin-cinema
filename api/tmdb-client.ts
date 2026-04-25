import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  genre_ids: number[];
  original_language: string;
  vote_average: number;
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string;
  tagline: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  original_language: string;
}

interface TmdbCredits {
  crew: { job: string; name: string }[];
  cast: { name: string; order: number }[];
}

export interface TmdbMovieData {
  tmdbTitle: string | null;
  tagline: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  plot: string | null;
  runtime: number | null;
  rating: number | null;
  voteCount: number | null;
  genres: string[] | null;
  releaseYear: number | null;
  director: string | null;
  cast: string[] | null;
  originalLanguage: string | null;
  trailerUrl: string | null;
  imdbId: string | null;
  ageRating: string | null;
  keywords: string[];
}

class TmdbClient {
  private apiKey: string;
  private requestCount: number = 0;
  private lastReset: number = Date.now();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async rateLimit() {
    this.requestCount++;
    // TMDb rate limit: 40 requests per 10 seconds
    if (this.requestCount >= 35) {
      const elapsed = Date.now() - this.lastReset;
      const wait = Math.max(0, 10000 - elapsed);
      if (wait > 0) {
        console.log(`  TMDb rate limit: waiting ${Math.ceil(wait / 1000)}s...`);
        await new Promise(r => setTimeout(r, wait));
      }
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
  }

  async searchMovie(title: string): Promise<TmdbSearchResult | null> {
    await this.rateLimit();
    try {
      const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
        params: {
          api_key: this.apiKey,
          query: title,
          language: 'en-US',
          page: 1,
        },
        timeout: 10000,
      });

      const results = response.data.results as TmdbSearchResult[];
      if (!results || results.length === 0) return null;

      // Find best match: exact title match first, then closest
      const exactMatch = results.find(r =>
        r.title.toLowerCase() === title.toLowerCase()
      );
      if (exactMatch) return exactMatch;

      // Prefer results with posters and recent releases
      const withPoster = results.filter(r => r.poster_path);
      return withPoster.length > 0 ? withPoster[0] : results[0];
    } catch (err) {
      console.error(`  TMDb search failed for "${title}":`, (err as Error).message);
      return null;
    }
  }

  async getMovieDetails(movieId: number): Promise<{ details: TmdbMovieDetails; credits: TmdbCredits; videos: { key: string; site: string; type: string }[]; externalIds: Record<string, string>; releaseDates: any[]; keywords: string[] } | null> {
    await this.rateLimit();
    try {
      const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
        params: {
          api_key: this.apiKey,
          language: 'en-US',
          append_to_response: 'credits,videos,external_ids,release_dates,keywords',
        },
        timeout: 10000,
      });

      const data = response.data;
      return {
        details: {
          id: data.id,
          title: data.title,
          overview: data.overview,
          tagline: data.tagline || null,
          runtime: data.runtime,
          vote_average: data.vote_average,
          vote_count: data.vote_count || 0,
          release_date: data.release_date,
          poster_path: data.poster_path,
          backdrop_path: data.backdrop_path,
          genres: data.genres || [],
          original_language: data.original_language,
        },
        credits: {
          crew: data.credits?.crew || [],
          cast: data.credits?.cast || [],
        },
        videos: (data.videos?.results || []) as { key: string; site: string; type: string }[],
        externalIds: data.external_ids || {},
        releaseDates: data.release_dates?.results || [],
        keywords: (data.keywords?.keywords || []).map((k: any) => k.name) as string[],
      };
    } catch (err) {
      console.error(`  TMDb details failed for movie ${movieId}:`, (err as Error).message);
      return null;
    }
  }

  buildPosterUrl(posterPath: string | null, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w342'): string | null {
    if (!posterPath) return null;
    return `${TMDB_IMAGE_BASE_URL}/${size}${posterPath}`;
  }

  async enrichMovie(title: string): Promise<TmdbMovieData | null> {
    const searchResult = await this.searchMovie(title);
    if (!searchResult) {
      console.log(`  No TMDb match for "${title}"`);
      return null;
    }

    const fullData = await this.getMovieDetails(searchResult.id);
    if (!fullData) return null;

    const { details, credits, videos, externalIds, releaseDates, keywords } = fullData;

    const preferredRelease = releaseDates.find((r: any) => r.iso_3166_1 === 'DE')
      ?? releaseDates.find((r: any) => r.iso_3166_1 === 'US');
    const ageRating = preferredRelease?.release_dates
      ?.find((rd: any) => rd.certification)?.certification || null;

    const director = credits.crew.find(c => c.job === 'Director')?.name || null;
    const cast = credits.cast
      .sort((a, b) => a.order - b.order)
      .slice(0, 6)
      .map(c => c.name);

    const releaseYear = details.release_date
      ? parseInt(details.release_date.split('-')[0])
      : null;

    const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube')
      ?? videos.find(v => v.site === 'YouTube');
    const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;

    console.log(`  ✓ Enriched "${title}" → "${details.title}"`);

    return {
      tmdbTitle: details.title || null,
      tagline: details.tagline || null,
      posterUrl: this.buildPosterUrl(details.poster_path, 'w342'),
      backdropUrl: this.buildPosterUrl(details.backdrop_path, 'w780'),
      plot: details.overview || null,
      runtime: details.runtime,
      rating: details.vote_average,
      voteCount: details.vote_count || null,
      genres: details.genres.map(g => g.name),
      releaseYear,
      director,
      cast: cast.length > 0 ? cast : null,
      originalLanguage: details.original_language || null,
      trailerUrl,
      imdbId: externalIds.imdb_id || null,
      ageRating,
      keywords,
    };
  }
}

export default TmdbClient;
