import axios from 'axios';
import { parseTitle } from './title-utils';
import { tokenSetRatio } from './fuzzy-match';

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
  vote_count?: number;
  popularity?: number;
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
  originalTitle: string | null; // Original title in the movie's original language
  alternativeTitles: string[]; // Titles in other languages for search
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

export interface TmdbSearchContext {
  year?: number | null;
  director?: string | null;
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

  private yearFromDate(date: string | null | undefined): number | null {
    if (!date) return null;
    const year = parseInt(date.split('-')[0], 10);
    return Number.isFinite(year) ? year : null;
  }

  private titleMatchScore(result: TmdbSearchResult, title: string): number {
    const expected = title.toLowerCase();
    const titleLower = result.title.toLowerCase();
    const originalLower = result.original_title.toLowerCase();

    if (titleLower === expected) return 1;
    if (originalLower === expected) return 0.95;
    return Math.max(tokenSetRatio(result.title, title), tokenSetRatio(result.original_title, title));
  }

  private movieSearchScore(result: TmdbSearchResult, title: string, context: TmdbSearchContext): number {
    let score = this.titleMatchScore(result, title) * 3;

    const resultYear = this.yearFromDate(result.release_date);
    if (context.year && resultYear) {
      const yearDiff = Math.abs(context.year - resultYear);
      if (yearDiff === 0) score += 1.25;
      else if (yearDiff === 1) score += 0.35;
      else score -= Math.min(1.5, yearDiff * 0.15);
    }

    if (result.poster_path) score += 0.15;
    if (result.overview) score += 0.08;
    if (result.popularity) score += Math.min(0.35, Math.log10(result.popularity + 1) * 0.12);
    if (result.vote_count) score += Math.min(0.25, Math.log10(result.vote_count + 1) * 0.08);

    return score;
  }

  private async directorScore(movieId: number, expectedDirector: string): Promise<number> {
    const fullData = await this.getMovieDetails(movieId);
    const director = fullData?.credits.crew.find(c => c.job === 'Director')?.name;
    if (!director) return 0;
    const score = tokenSetRatio(director, expectedDirector);
    if (score > 0.9) return 1.5;
    if (score > 0.65) return 0.75;
    return -0.75;
  }

  async searchMovie(title: string, context: TmdbSearchContext = {}): Promise<TmdbSearchResult | null> {
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

      const ranked = results
        .map((result, index) => ({
          result,
          index,
          score: this.movieSearchScore(result, title, context),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index);

      if (context.director) {
        const titleCloseEnough = ranked
          .filter(r => this.titleMatchScore(r.result, title) >= 0.9)
          .slice(0, 5);
        for (const candidate of titleCloseEnough) {
          candidate.score += await this.directorScore(candidate.result.id, context.director);
        }
        ranked.sort((a, b) => b.score - a.score || a.index - b.index);
      }

      return ranked[0].result;
    } catch (err) {
      console.error(`  TMDb search failed for "${title}":`, (err as Error).message);
      return null;
    }
  }

  async getMovieDetails(movieId: number): Promise<{ details: TmdbMovieDetails; credits: TmdbCredits; videos: { key: string; site: string; type: string }[]; externalIds: Record<string, string>; releaseDates: any[]; keywords: string[]; translations: any } | null> {
    await this.rateLimit();
    try {
      const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
        params: {
          api_key: this.apiKey,
          language: 'en-US',
          append_to_response: 'credits,videos,external_ids,release_dates,keywords,translations',
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
        translations: data.translations || null,
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

  async enrichMovie(title: string, altTitle?: string | null, context: TmdbSearchContext = {}): Promise<TmdbMovieData | null> {
    const searchTitle = parseTitle(title).baseTitle;
    let searchResult = await this.searchMovie(searchTitle, context);

    if (!searchResult && title.includes(' - ')) {
      const baseTitle = parseTitle(title.split(' - ')[0].trim()).baseTitle;
      console.log(`  Retrying TMDb search with base title: "${baseTitle}"`);
      searchResult = await this.searchMovie(baseTitle, context);
    }

    if (!searchResult && altTitle) {
      const altSearch = parseTitle(altTitle).baseTitle;
      console.log(`  Retrying TMDb search with altTitle: "${altSearch}"`);
      searchResult = await this.searchMovie(altSearch, context);
    }

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

    // Extract alternative titles from translations (titles in other languages)
    const alternativeTitles: string[] = [];
    if (fullData.translations?.translations) {
      // Use iso_639_1 for language codes, and 'name' for the title in that language
      const targetLanguages = ['de', 'fr', 'es', 'it', 'pt', 'ja', 'ko', 'zh', 'ru'];
      for (const translation of fullData.translations.translations) {
        const langCode = (translation.iso_639_1 || translation.iso_3166_1 || '').toLowerCase();
        const localTitle = translation.name;
        if (targetLanguages.includes(langCode) && localTitle &&
            localTitle !== searchResult.original_title && localTitle !== details.title) {
          alternativeTitles.push(localTitle);
        }
      }
    }

    return {
      tmdbTitle: details.title || null,
      originalTitle: searchResult.original_title || details.title || null,
      alternativeTitles,
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
