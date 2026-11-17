import type { Movie } from '../types';

type TitleFields = Pick<Movie, 'title' | 'tmdbTitle' | 'altTitle' | 'originalTitle'>;

/** The English title shown everywhere in the UI. */
export const englishTitle = (movie: TitleFields): string =>
  movie.tmdbTitle || movie.altTitle || movie.title;

const normalize = (value: string) =>
  value.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** The original-language title, only when it differs from the English title. */
export const differentOriginalTitle = (movie: TitleFields): string | null => {
  const original = movie.originalTitle?.trim();
  if (!original) return null;
  return normalize(original) === normalize(englishTitle(movie)) ? null : original;
};
