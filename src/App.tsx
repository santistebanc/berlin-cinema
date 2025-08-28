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

  useEffect(() => {
    loadMovies();
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
