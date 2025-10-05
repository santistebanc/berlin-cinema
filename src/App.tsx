import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { MovieProvider, useMovies } from './contexts/MovieContext';

const AppContent: React.FC = () => {
  const { movies, loading, error } = useMovies();

  const handleSearch = (query: string) => {
    // The search is handled by URL params and HomePage's search functionality
    // This function is passed to Header for consistency but the actual search
    // logic is in HomePage using the URL search parameter
  };

  return (
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
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MovieProvider>
        <AppContent />
      </MovieProvider>
    </ThemeProvider>
  );
};

export default App;
