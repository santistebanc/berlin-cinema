export interface Movie {
  id: string;
  title: string;
  originalTitle?: string;
  year: number;
  country: string;
  director: string;
  cast: string[];
  posterUrl: string;
  trailerUrl?: string;
  reviewUrl?: string;
  language: string;
  fskRating: number;
  cinemas: Cinema[];
  variants?: string[]; // Store variant tags like (Imax), (EXPN), etc.
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
