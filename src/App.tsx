import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import PWAInstaller from './components/PWAInstaller';
import { ThemeProvider } from './contexts/ThemeContext';
import { movieApi } from './services/api';
import { Movie } from './types';

const App: React.FC = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const LAST_FETCH_KEY = 'movies_last_fetch';
  const MOVIES_CACHE_KEY = 'movies_cache';

  useEffect(() => {
    const maybeLoadFromCacheOrFetch = async () => {
      try {
        const lastFetchString = localStorage.getItem(LAST_FETCH_KEY);
        const cachedMoviesString = localStorage.getItem(MOVIES_CACHE_KEY);

        const lastFetchAt = lastFetchString ? Number(lastFetchString) : 0;
        const now = Date.now();
        const isFresh = lastFetchAt > 0 && now - lastFetchAt < ONE_HOUR_MS;

        if (isFresh && cachedMoviesString) {
          try {
            const cached: Movie[] = JSON.parse(cachedMoviesString);
            if (Array.isArray(cached) && cached.length > 0) {
              setMovies(cached);
              setError(null);
              setLoading(false);
              return;
            }
          } catch {
            // Ignore cache parse errors and proceed to fetch
          }
        }

        await loadMovies();
      } catch {
        // As a fallback, attempt network fetch
        await loadMovies();
      }
    };

    maybeLoadFromCacheOrFetch();
  }, []);

  const loadMovies = async () => {
    try {
      setLoading(true);
      const moviesResult = await movieApi.getAllMovies();
      
      if (!moviesResult.movies || moviesResult.movies.length === 0) {
        console.error('No movies found in API response');
        setError('No movies data received from API');
        return;
      }
      
      setMovies(moviesResult.movies);
      setError(null);

      // Update cache and last fetch timestamp on success
      try {
        localStorage.setItem(MOVIES_CACHE_KEY, JSON.stringify(moviesResult.movies));
        localStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
      } catch {
        // Ignore storage errors
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(`Failed to load movies: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    // The search is handled by URL params and HomePage's search functionality
    // This function is passed to Header for consistency but the actual search
    // logic is in HomePage using the URL search parameter
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header movies={movies} onSearch={handleSearch} />
        <main className="py-2">
          <Routes>
            <Route path="/" element={
              <div className="container mx-auto px-4">
                <HomePage movies={movies} loading={loading} error={error} />
              </div>
            } />
            <Route path="/movie/:title" element={<MovieDetailPage />} />
          </Routes>
        </main>
        <PWAInstaller />
      </div>
    </ThemeProvider>
  );
};

export default App;
