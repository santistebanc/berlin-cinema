import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Movie } from '../types';

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

const searchMovies = (movies: Movie[], query: string): Movie[] => {
  if (movies.length === 0) {
    return [];
  }

  if (!query.trim()) {
    return movies;
  }

  const searchTerm = query.toLowerCase().trim();

  return movies.filter((movie) => {
    if (movie.title?.toLowerCase().includes(searchTerm)) return true;
    if (movie.tmdbTitle?.toLowerCase().includes(searchTerm)) return true;
    if (movie.criticTitle?.toLowerCase().includes(searchTerm)) return true;
    if (movie.director?.toLowerCase().includes(searchTerm)) return true;
    if (movie.cast?.some((actor) => actor?.toLowerCase().includes(searchTerm))) return true;
    if (movie.variants?.some((v) => v?.toLowerCase().includes(searchTerm))) return true;
    if (movie.genres?.some((g) => g?.toLowerCase().includes(searchTerm))) return true;
    if (movie.country?.toLowerCase().includes(searchTerm)) return true;
    if (movie.originalLanguage?.toLowerCase().includes(searchTerm)) return true;
    if (movie.year?.toString().includes(searchTerm)) return true;
    if (movie.keywords?.some((k) => k?.toLowerCase().includes(searchTerm))) return true;

    return false;
  });
};

const sortMoviesByShowtimes = (movies: Movie[]): Movie[] => {
  return [...movies].sort((a, b) => getMovieShowtimeCount(b) - getMovieShowtimeCount(a));
};

export const useHomePageMovies = (movies: Movie[]) => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    setSearchQuery(searchParams.get('search') ?? '');
  }, [searchParams]);

  const filteredMovies = useMemo(() => searchMovies(movies, searchQuery), [movies, searchQuery]);
  const sortedMovies = useMemo(() => sortMoviesByShowtimes(filteredMovies), [filteredMovies]);

  const clearSearch = () => {
    setSearchQuery('');
    navigate('/', { replace: true });
  };

  return {
    clearSearch,
    searchQuery,
    sortedMovies,
  };
};
