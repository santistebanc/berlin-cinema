import { ScrapingResult } from '../types';

const BUILD_TIME = import.meta.env.VITE_BUILD_TIME ?? 'dev';
const MOVIES_URL = `${import.meta.env.BASE_URL}movies.json/`;

export const movieApi = {
  async getAllMovies(): Promise<ScrapingResult> {
    const res = await fetch(`${MOVIES_URL}?v=${BUILD_TIME}`);
    if (!res.ok) throw new Error(`Failed to load movies: ${res.status}`);
    return res.json();
  },
};
