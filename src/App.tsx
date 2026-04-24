import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { MovieProvider, useMovies } from './contexts/MovieContext';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15, ease: 'easeIn' } },
};

const AppContent: React.FC = () => {
  const { movies, loading, error } = useMovies();
  const location = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const handleSearch = (_query: string) => {};

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header movies={movies} onSearch={handleSearch} />
      <main className="py-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Routes location={location}>
              <Route path="/" element={
                <div className="container mx-auto px-4">
                  <HomePage movies={movies} loading={loading} error={error} />
                </div>
              } />
              <Route path="/movie/:title" element={<MovieDetailPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
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
