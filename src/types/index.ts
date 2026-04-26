export interface Movie {
  title: string;
  criticTitle: string | null;
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
}

export interface ShowingInfo {
  cinema: string;
  variant: string | null; // OV, sub, Imax, EXPN, etc.
}

export interface Showing {
  date: string; // Formatted as "Thu, Aug 27"
  time: string; // Formatted as "13:50"
  cinema: string;
  variant: string | null; // OV, sub, Imax, EXPN, etc.
}

export interface Cinema {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  url: string;
  websiteUrl?: string;
  osmFetched?: boolean;
  lat?: number;
  lon?: number;
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
  movies: Movie[];
  totalMovies: number;
  scrapedAt: string;
}

export interface CinemaInfo {
  id: string;
  name: string;
  district: string;
}
