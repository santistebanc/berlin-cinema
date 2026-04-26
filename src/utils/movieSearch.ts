import Fuse from 'fuse.js';
import { Movie } from '../types';

export function createMovieFuse(movies: Movie[]) {
  return new Fuse(movies, {
    threshold: 0.35,
    distance: 200,
    minMatchCharLength: 2,
    includeScore: true,
    keys: [
      { name: 'title', weight: 10 },
      { name: 'tmdbTitle', weight: 10 },
      { name: 'criticTitle', weight: 8 },
      { name: 'director', weight: 5 },
      { name: 'cast', weight: 3 },
      { name: 'genres', weight: 2.5 },
      { name: 'variants', weight: 2 },
      { name: 'keywords', weight: 1.5 },
      { name: 'plot', weight: 1 },
      { name: 'country', weight: 1 },
      { name: 'originalLanguage', weight: 1 },
    ],
  });
}
