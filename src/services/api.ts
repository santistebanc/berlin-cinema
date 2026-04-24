import { ScrapingResult } from '../types';

const BUILD_TIME = import.meta.env.VITE_BUILD_TIME ?? 'dev';

export const movieApi = {
  async getAllMovies(): Promise<ScrapingResult> {
    const res = await fetch(`/movies.json?v=${BUILD_TIME}`);
    if (!res.ok) throw new Error(`Failed to load movies: ${res.status}`);
    return res.json();
  },
};
