export interface Movie {
  title: string;
  director: string | null;
  cast: string[] | null;
  country: string | null;
  year: number | null;
  posterUrl: string | null;
  trailerUrl: string | null;
  url: string | null;
  variants: string[];
  cinemas: Cinema[];
  showings: Record<string, Record<string, ShowingInfo[]>>; // Date -> Time -> Cinema+Variant[]
  
  // Additional movie information from external APIs
  imdbID?: string | null;
  imdbRating?: string | null;
  imdbVotes?: string | null;
  metascore?: string | null;
  plot?: string | null;
  runtime?: string | null;
  genre?: string | null;
  awards?: string | null;
  rated?: string | null;
  language?: string | null;
  tmdbID?: number | null;
  tmdbRating?: number | null;
  tmdbVotes?: number | null;
  overview?: string | null;
  releaseDate?: string | null;
  budget?: number | null;
  revenue?: number | null;
  popularity?: number | null;
  genres?: string[] | null;
  productionCompanies?: string[] | null;
  backdropUrl?: string | null;
}

export interface Cinema {
  name: string;
  address: string;
}

export interface ShowingInfo {
  cinema: string;
  variant: string | null; // OV, sub, Imax, EXPN, etc.
}

export interface Cinema {
  name: string;
  address: string;
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
