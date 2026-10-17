import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { movieApi } from '../services/api';
import { Movie, ScrapingResult } from '../types';
import { loadMovieData, movieDataState, MovieDataState } from '../services/movie-data';
import { currentSnapshot } from '../utils/liveSnapshot';

interface MovieContextType {
  movies: Movie[];
  loading: boolean;
  error: string | null;
  dataState: MovieDataState;
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
  const [dataState, setDataState] = useState<MovieDataState>('unavailable');
  const previous = useRef<ScrapingResult | null>(null);

  const loadMovies = async () => {
    try {
      setLoading(true);
      const result = await loadMovieData(() => movieApi.getAllMovies(), previous.current);
      previous.current = result.snapshot;
      setMovies(result.snapshot?.movies ?? []);
      setError(result.error ? result.loadState === 'schema-failed'
        ? 'The listings file has an invalid format.' : 'The listings request failed. Please try again.' : null);
      setDataState(result.dataState);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(`Failed to load movies: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovies();
    const timer = setInterval(() => {
      if (!previous.current) return;
      const snapshot = currentSnapshot(previous.current);
      previous.current = snapshot; setMovies(snapshot.movies); setDataState(movieDataState(snapshot));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const refetch = async () => {
    await loadMovies();
  };

  return (
    <MovieContext.Provider value={{ movies, loading, error, dataState, refetch }}>
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
