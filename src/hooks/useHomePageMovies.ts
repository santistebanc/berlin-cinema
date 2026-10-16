import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Movie } from '../types';
import { createMovieFuse } from '../utils/movieSearch';
import { setHomeSearch } from '../utils/homeSearch';

export const getMovieShowtimeCount = (movie: Movie | undefined): number => {
  if (!movie?.showings || typeof movie.showings !== 'object' || Array.isArray(movie.showings)) {
    return 0;
  }

  let total = 0;

  Object.values(movie.showings).forEach((dateShowings) => {
    if (!dateShowings || typeof dateShowings !== 'object') {
      return;
    }

    Object.values(dateShowings).forEach((timeShowings) => {
      if (Array.isArray(timeShowings)) {
        total += timeShowings.length;
      }
    });
  });

  return total;
};

const sortMoviesByShowtimes = (movies: Movie[]): Movie[] => {
  return [...movies].sort((a, b) => getMovieShowtimeCount(b) - getMovieShowtimeCount(a));
};

export const useHomePageMovies = (movies: Movie[]) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') ?? '');

  useEffect(() => {
    setSearchQuery(searchParams.get('search') ?? '');
  }, [searchParams]);

  const fuse = useMemo(() => createMovieFuse(movies), [movies]);

  const filteredMovies = useMemo(() => {
    if (!searchQuery.trim() || movies.length === 0) return movies;
    return fuse.search(searchQuery).map(r => r.item);
  }, [fuse, movies, searchQuery]);

  const sortedMovies = useMemo(
    () => searchQuery.trim() ? filteredMovies : sortMoviesByShowtimes(filteredMovies),
    [filteredMovies, searchQuery]
  );

  const clearSearch = () => {
    setSearchQuery('');
    setHomeSearch('');
    navigate('/', { replace: true });
  };

  return {
    clearSearch,
    searchQuery,
    sortedMovies,
  };
};
