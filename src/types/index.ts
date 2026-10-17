import type { Modality, Provenance } from '../../shared/contracts';

export interface SourceAlias {
  provenance?: Provenance;
  source: string;
  subject: string;
  url: string | null;
  recordId: string | number | null;
  entityId: string;
  evidenceFingerprint: string;
  labels: string[];
}

export interface Movie {
  id?: string;
  identityGroupKey?: string;
  kind?: 'film' | 'programme';
  slugAliases?: string[];
  identityStatus?: 'verified' | 'source-only';
  title: string;
  slug: string;
  criticTitle: string | null;
  altTitle: string | null;
  director: string | null;
  cast: string[] | null;
  country: string | null;
  year: number | null;
  posterUrl: string | null;
  url: string | null;
  variants: string[];
  cinemas: Cinema[];
  showings: Record<string, Record<string, ShowingInfo[]>>; // Date -> Time -> Cinema+Variant[]
  // TMDb-enriched fields
  originalTitle: string | null; // Original title in the movie's original language
  alternativeTitles: string[]; // Titles in other languages for search
  tmdbTitle: string | null;
  tagline: string | null;
  plot: string | null;
  runtime: number | null;
  rating: number | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  allRatings: { source: string; value: string }[] | null;
  voteCount: number | null;
  genres: string[] | null;
  originalLanguage: string | null;
  trailerUrl: string | null;
  imdbId: string | null;
  backdropUrl: string | null;
  ageRating: string | null;
  keywords: string[];
  tmdbFetched?: boolean;
  omdbFetchedAt?: string;
  directors?: string[];
  writers?: string[];
  spokenLanguages?: { code: string | null; name: string }[];
  productionCountries?: { code: string; name: string }[];
  productionCompanies?: { id: number; name: string; country: string | null }[];
  releaseDate?: string | null;
  germanReleaseDate?: string | null;
  certifications?: { country: string; certification: string; releaseType?: number; releaseDate?: string | null }[];
  homepage?: string | null;
  status?: string | null;
  externalIds?: Record<string, any>;
  awards?: string | null;
  isSpecial?: boolean;
  sourceTitles?: string[];
  sourceAliases?: SourceAlias[];
}

export interface ShowingInfo {
  id?: string;
  venueId?: string;
  uncertain?: boolean;
  stale?: boolean;
  edition?: string | null;
  modality?: Modality;
  alternatives?: Modality[];
  sourceUrls?: string[];
  lastObservedAt?: string;
  cinema: string;
  variants: string[]; // e.g. ['MXP 2D', 'OmU'], ['OV'], []
}

export interface Showing {
  date: string; // Formatted as "Thu, Aug 27"
  time: string; // Formatted as "13:50"
  cinema: string;
  variants: string[]; // e.g. ['MXP 2D', 'OmU'], ['OV'], []
}

export interface Cinema {
  id: string;
  name: string;
  sourceAliases?: SourceAlias[];
  address: string;
  city: string;
  postalCode: string;
  url: string;
  websiteUrl?: string;
  latitude?: number;
  longitude?: number;
  locationEvidence?: { source?: string; [key: string]: any };
  osmFetched?: boolean;
  showtimes: Showtime[];
}

export interface Showtime {
  date: string;
  times: string[];
  dayOfWeek: string;
  // Backend-processed data
  showtimeEntries?: ShowtimeEntry[];
  timeInfo?: Record<string, any[]>;
}

export interface ShowtimeEntry {
  date: string;
  time: string;
  cinema: string;
  variants: string[];
  address: string;
  city: string;
  postalCode: string;
  url: string;
  dayOfWeek?: string;
}

export interface ScrapingResult {
  schemaVersion?: number;
  programmeStatus?: 'available' | 'empty' | 'no-current-support';
  movies: Movie[];
  totalMovies: number;
  scrapedAt: string;
}

export interface CinemaInfo {
  id: string;
  name: string;
  district: string;
}
