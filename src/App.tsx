import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { MovieProvider, useMovies } from './contexts/MovieContext';

const AppContent: React.FC = () => {
  const { movies, loading, error } = useMovies();
  const location = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--bg))' }}>
      <Header movies={movies} onSearch={() => {}} />
      <main className="py-3 sm:py-6">
        <Routes>
          <Route path="/" element={
            <div className="px-3 sm:px-6 lg:px-8">
              <HomePage movies={movies} loading={loading} error={error} />
            </div>
          } />
          <Route path="/movie/:title" element={
            <div className="px-0 sm:px-6 lg:px-8">
              <MovieDetailPage />
            </div>
          } />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <MovieProvider>
          <AppContent />
        </MovieProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
};

export default App;
