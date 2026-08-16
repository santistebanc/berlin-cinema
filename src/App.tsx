import React, { useEffect, useLayoutEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import { MovieProvider, useMovies } from './contexts/MovieContext';

// Module-level flag — suppresses save listener during our own scrollTo calls
let suppressSave = false;

const AppContent: React.FC = () => {
  const { movies, loading, error } = useMovies();
  const location = useLocation();

  // Save on scroll events — but not during our own programmatic scrollTo
  useEffect(() => {
    const save = () => {
      if (!suppressSave) sessionStorage.setItem(`scroll:${location.pathname}`, String(window.scrollY));
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.pathname]);

  // Restore before paint; suppress save listener during the programmatic scroll so it
  // can't overwrite the stored position with 0
  useLayoutEffect(() => {
    history.scrollRestoration = 'manual';
    if (loading) return;
    const saved = sessionStorage.getItem(`scroll:${location.pathname}`);
    suppressSave = true;
    window.scrollTo(0, saved ? parseInt(saved) : 0);
    requestAnimationFrame(() => { suppressSave = false; });
  }, [location.pathname, loading]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--bg))' }}>
      <Header movies={movies} onSearch={() => {}} />
      <main>
        <Routes>
          <Route path="/" element={
            <div className="px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
              <HomePage movies={movies} loading={loading} error={error} />
            </div>
          } />
          <Route path="/:title" element={<MovieDetailPage />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HelmetProvider>
      <MovieProvider>
        <AppContent />
      </MovieProvider>
    </HelmetProvider>
  );
};

export default App;
