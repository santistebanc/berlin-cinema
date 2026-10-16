import axios from 'axios';
import type { AuditDecision } from '../src/types/audit';

const BASE = 'https://api.themoviedb.org/3';
export interface TmdbSearchResult {
  id: number; title: string; original_title: string; release_date: string; overview: string;
  poster_path?: string | null; original_language?: string;
}
export interface TmdbMovieData {
  tmdbTitle: string | null; originalTitle: string | null; alternativeTitles: string[]; tagline: string | null;
  posterUrl: string | null; backdropUrl: string | null; plot: string | null; runtime: number | null;
  rating: number | null; voteCount: number | null; genres: string[]; releaseYear: number | null;
  director: string | null; cast: string[] | null; originalLanguage: string | null; trailerUrl: string | null;
  imdbId: string | null; ageRating: string | null; keywords: string[];
  country: string | null; directors: string[]; writers: string[];
  releaseDate: string | null; germanReleaseDate: string | null;
  spokenLanguages: { code: string; name: string }[];
  productionCountries: { code: string; name: string }[];
  productionCompanies: { id: number; name: string; country: string | null }[];
  certifications: { country: string; certification: string; releaseType: number; releaseDate: string | null }[];
  homepage: string | null; status: string | null;
  externalIds: Record<string, any>;
}

const names = (people: any[]) => [...new Set<string>(people.map(person => person.name).filter(Boolean))];
const dateOnly = (value: any): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = value.slice(0, 10); const parsed = Date.parse(date);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? date : null;
};
const imageUrl = (path: any, size = 'w342') => typeof path === 'string' && path.startsWith('/') ? `https://image.tmdb.org/t/p/${size}${path}` : null;

/** Pure projection: all original credits, images, translations and release records remain in the cached detail bundle. */
export function tmdbMovieData(data: any, originalTitle?: string): TmdbMovieData {
  const details = data.details ?? {}; const credits = data.credits ?? { crew: [], cast: [] };
  const directors = names((credits.crew ?? []).filter((person: any) => ['Director', 'Co-Director'].includes(person.job)));
  const countries = (details.production_countries ?? []).map((country: any) => ({ code: country.iso_3166_1, name: country.name })).filter((country: any) => country.code && country.name);
  const releases = (data.releaseDates ?? details.release_dates?.results ?? []).flatMap((region: any) => (region.release_dates ?? [])
    .map((release: any) => ({ country: region.iso_3166_1, certification: release.certification || '', releaseType: release.type, releaseDate: dateOnly(release.release_date) })));
  const german = releases.filter((release: any) => release.country === 'DE');
  const releaseRank = (type: number) => { const index = [3, 2, 1, 4, 5, 6].indexOf(type); return index < 0 ? 99 : index; };
  const preferred = (items: any[]) => [...items].sort((a, b) => (releaseRank(a.releaseType) - releaseRank(b.releaseType))
    || (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'));
  const trailer = [...(data.videos ?? details.videos?.results ?? [])].filter((video: any) => video.site === 'YouTube' && video.key)
    .sort((a: any, b: any) => Number(b.type === 'Trailer') - Number(a.type === 'Trailer') || Number(!!b.official) - Number(!!a.official))[0];
  const cast = names([...(credits.cast ?? [])].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))).slice(0, 6);
  const translations = data.translations?.translations ?? details.translations?.translations ?? [];
  const localized = ['en', 'de', details.original_language].filter(Boolean).flatMap(language => translations.filter((item: any) => item.iso_639_1 === language));
  const aliases = data.alternativeTitles ?? details.alternative_titles?.titles ?? [];
  const images = data.images ?? details.images ?? {};
  const externalIds = { ...(data.externalIds ?? details.external_ids ?? {}) };
  const date = dateOnly(details.release_date);
  return {
    tmdbTitle: details.title || null, originalTitle: originalTitle || details.original_title || details.title || null,
    alternativeTitles: [...new Set<string>([...translations.map((item: any) => item.data?.title), ...aliases.map((item: any) => item.title)].filter(Boolean))],
    tagline: details.tagline || localized.find((item: any) => item.data?.tagline)?.data.tagline || null, posterUrl: imageUrl(details.poster_path || images.posters?.[0]?.file_path),
    backdropUrl: imageUrl(details.backdrop_path || images.backdrops?.[0]?.file_path, 'w780'), plot: details.overview || localized.find((item: any) => item.data?.overview)?.data.overview || null,
    runtime: Number.isFinite(details.runtime) && details.runtime > 0 ? details.runtime : null,
    rating: details.vote_average ?? null, voteCount: details.vote_count ?? null, genres: (details.genres ?? []).map((genre: any) => genre.name),
    releaseYear: date ? Number(date.slice(0, 4)) : null, releaseDate: date,
    germanReleaseDate: preferred(german.filter((release: any) => release.releaseDate))[0]?.releaseDate ?? null,
    director: directors.join(', ') || null, directors, writers: names((credits.crew ?? []).filter((person: any) => ['Writer', 'Screenplay', 'Story', 'Novel', 'Book'].includes(person.job))),
    cast: cast.length ? cast : null, originalLanguage: details.original_language || null,
    spokenLanguages: (details.spoken_languages ?? []).map((language: any) => ({ code: language.iso_639_1, name: language.english_name || language.name })).filter((language: any) => language.code),
    country: countries.map((country: any) => country.name).join(', ') || null, productionCountries: countries,
    productionCompanies: (details.production_companies ?? []).map((company: any) => ({ id: company.id, name: company.name, country: company.origin_country || null })),
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}` : null,
    imdbId: externalIds.imdb_id || details.imdb_id || null, externalIds,
    ageRating: preferred(german.filter((release: any) => release.certification))[0]?.certification || null,
    certifications: releases.filter((release: any) => release.certification),
    keywords: data.keywords ?? (details.keywords?.keywords ?? []).map((keyword: any) => keyword.name),
    homepage: /^https?:\/\//i.test(details.homepage || '') ? details.homepage : null, status: details.status || null,
  };
}

export function tmdbCandidate(data: any, search?: TmdbSearchResult): any {
  const metadata = tmdbMovieData(data);
  return { ...metadata, id: data.details?.id ?? search?.id, title: metadata.tmdbTitle || search?.title,
    originalTitle: metadata.originalTitle || search?.original_title, year: metadata.releaseYear || Number(search?.release_date?.slice(0, 4)) || null,
    overview: metadata.plot || search?.overview || null };
}

/** TMDb retrieves evidence. Identity acceptance belongs to the pipeline resolver. */
export default class TmdbClient {
  private requests: number[] = [];
  private errors: { route: string; status: number | null; reason: string }[] = [];
  retrievalErrors() { return [...this.errors]; }
  constructor(private apiKey: string, private onDecision?: (decision: AuditDecision) => void) {}
  private async get(route: string, params: Record<string, any>): Promise<any | null> {
    this.requests = this.requests.filter(at => at > Date.now() - 10000);
    if (this.requests.length >= 35) await new Promise(resolve => setTimeout(resolve, Math.max(0, this.requests[0] + 10000 - Date.now())));
    this.requests.push(Date.now());
    try {
      const response = await axios.get(`${BASE}${route}`, { params: { api_key: this.apiKey, ...params }, timeout: 10000, maxRedirects: 0, maxContentLength: 8 * 1024 * 1024 });
      return response.data;
    } catch (error: any) {
      this.errors.push({ route, status: error.response?.status ?? null,
        reason: error.response?.status ? `TMDb HTTP ${error.response.status}` : error.code === 'ECONNABORTED' ? 'TMDb request timed out' : 'TMDb network request failed' });
      this.onDecision?.({ entity: 'pipeline', subject: 'TMDb retrieval', provider: 'TMDb', action: 'request-failed',
        details: { route, status: error.response?.status ?? null } });
      return null;
    }
  }
  async candidates(titles: string[]): Promise<TmdbSearchResult[]> {
    const results = new Map<number, TmdbSearchResult>();
    for (const title of [...new Set(titles.filter(Boolean))].slice(0, 3)) {
      for (const language of ['en-US', 'de-DE']) {
        const response = await this.get('/search/movie', { query: title, language, page: 1 });
        const normalizeTitle = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const exact = (response?.results ?? []).filter((result: any) => [result.title, result.original_title]
          .some(label => typeof label === 'string' && normalizeTitle(label) === normalizeTitle(title)));
        for (const result of [...exact, ...(response?.results?.slice(0, 5) ?? [])]) if (Number.isInteger(result.id)) results.set(result.id, result);
        this.onDecision?.({ entity: 'movie', subject: title, provider: 'TMDb', action: 'candidate-retrieval',
          details: { query: title, language, candidates: response?.results?.slice(0, 5) ?? [], selection: 'Retrieval only; no candidate automatically selected.' } });
      }
    }
    return [...results.values()];
  }
  async getMovieDetails(id: number): Promise<any | null> {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid TMDb identity');
    const data = await this.get(`/movie/${id}`, { language: 'en-US', append_to_response: 'credits,videos,external_ids,release_dates,keywords,translations,alternative_titles,images', include_image_language: 'en,de,null' });
    if (!data || data.id !== id) return null;
    return { details: data, credits: data.credits ?? { crew: [], cast: [] }, videos: data.videos?.results ?? [],
      externalIds: data.external_ids ?? {}, releaseDates: data.release_dates?.results ?? [],
      keywords: (data.keywords?.keywords ?? []).map((k: any) => k.name), translations: data.translations ?? null,
      alternativeTitles: data.alternative_titles?.titles ?? [], images: data.images ?? {} };
  }
  buildPosterUrl(image: string | null, size = 'w342'): string | null { return image ? `https://image.tmdb.org/t/p/${size}${image}` : null; }
  async enrichSelected(id: number, originalTitle?: string, _sourceTitle = '', bundle?: any): Promise<TmdbMovieData | null> {
    if (bundle && bundle.details?.id !== id) throw new Error('TMDb detail bundle does not match the selected identity');
    const data = bundle ?? await this.getMovieDetails(id);
    return data ? tmdbMovieData(data, originalTitle) : null;
  }
}
