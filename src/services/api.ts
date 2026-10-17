import { ScrapingResult } from '../types';
import { parsePublicSnapshot } from '../../shared/contracts';

const BUILD_TIME = import.meta.env.VITE_BUILD_TIME ?? 'dev';
const MOVIES_URL = `/movies.json`;

export const movieApi = {
  async getAllMovies(): Promise<ScrapingResult> {
    const res = await fetch(`${MOVIES_URL}?v=${BUILD_TIME}`);
    if (!res.ok) throw new Error(`Failed to load movies: ${res.status}`);
    return parsePublicSnapshot(await res.json()) as unknown as ScrapingResult;
  },
};
