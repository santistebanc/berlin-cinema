export interface Movie {
  id: string;
  title: string;
  language: string;
  year?: string;
  country?: string;
  director?: string;
  cast?: string[];
  fsk?: string;
  imageUrl?: string;
  trailerUrl?: string;
  reviewUrl?: string;
  cinemas: Cinema[];
  variants?: string[];
}

export interface Cinema {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  url?: string;
  showtimes: Showtime[];
}

export interface Showtime {
  date: string;
  time: string;
  language: string;
  variants?: string[];
}

export interface ScrapingResult {
  movies: Movie[];
  cinemas: CinemaInfo[];
  lastUpdated: string;
}

export interface CinemaInfo {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  url?: string;
}
