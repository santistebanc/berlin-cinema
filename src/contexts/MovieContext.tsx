import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { movieApi } from '../services/api';
import { Movie, ScrapingResult } from '../types';
import { loadMovieData } from '../services/movie-data';

interface MovieContextType {
  movies: Movie[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const MovieContext = createContext<MovieContextType | undefined>(undefined);

interface MovieProviderProps {
  children: ReactNode;
}

export const MovieProvider: React.FC<MovieProviderProps> = ({ children }) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<ScrapingResult | null>(null);

  const loadMovies = async () => {
    try {
      setLoading(true);
      const result = await loadMovieData(() => movieApi.getAllMovies(), previous.current);
      previous.current = result.snapshot;
      setMovies(result.snapshot?.movies ?? []);
      setError(result.error);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(`Failed to load movies: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovies();
  }, []);

  const refetch = async () => {
    await loadMovies();
  };

  return (
    <MovieContext.Provider value={{ movies, loading, error, refetch }}>
      {children}
    </MovieContext.Provider>
  );
};

export const useMovies = () => {
  const context = useContext(MovieContext);
  if (context === undefined) {
    throw new Error('useMovies must be used within a MovieProvider');
  }
  return context;
};
