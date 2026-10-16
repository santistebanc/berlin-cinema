import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import { MovieProvider, useMovies } from './contexts/MovieContext';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));

// Module-level flag — suppresses save listener during our own scrollTo calls
let suppressSave = false;

const HOME_SCROLL_KEY = 'scroll:/';

const AppContent: React.FC = () => {
  const { movies, loading, error } = useMovies();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const scrollYRef = useRef(0);

  // Only the home page remembers its scroll position; every other page opens at the top.
  // Cleanup writes the last real position (ref), not window.scrollY after restore.
  useEffect(() => {
    if (!isHome) return;
    const save = () => {
      scrollYRef.current = window.scrollY;
      if (!suppressSave) sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY));
    };
    scrollYRef.current = window.scrollY;
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      if (!suppressSave) sessionStorage.setItem(HOME_SCROLL_KEY, String(scrollYRef.current));
    };
  }, [isHome]);

  // Restore before paint; suppress save listener during the programmatic scroll so it
  // can't overwrite the stored position with 0
  useLayoutEffect(() => {
    history.scrollRestoration = 'manual';
    if (loading) return;
    const saved = isHome ? sessionStorage.getItem(HOME_SCROLL_KEY) : null;
    suppressSave = true;
    window.scrollTo(0, saved ? parseInt(saved) : 0);
    requestAnimationFrame(() => { suppressSave = false; });
  }, [location.pathname, isHome, loading]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--bg))' }}>
      {!/^\/admin(?:\/|$)/.test(location.pathname) && <Header movies={movies} onSearch={() => {}} />}
      <main>
        <Routes>
          <Route path="/admin/review" element={<Suspense fallback={<p className="body-muted p-8">Opening local review…</p>}><ReviewPage /></Suspense>} />
          <Route path="/admin/*" element={<Suspense fallback={<p className="body-muted p-8">Loading data audit…</p>}><AdminPage /></Suspense>} />
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
