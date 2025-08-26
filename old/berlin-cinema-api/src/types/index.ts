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
  language: string; // OV, OmU, etc.
  fskRating: number; // German age rating
  cinemas: Cinema[];
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


