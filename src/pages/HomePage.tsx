import React from 'react';
import { Movie } from '../types';
import HomeMovieGrid from '../components/home/HomeMovieGrid';
import HomePageEmptyState from '../components/home/HomePageEmptyState';
import HomePageLoadingState from '../components/home/HomePageLoadingState';
import Card from '../components/ui/Card';
import { useHomePageMovies } from '../hooks/useHomePageMovies';
import type { MovieDataState } from '../services/movie-data';

interface HomePageProps {
  movies: Movie[];
  loading: boolean;
  error: string | null;
  dataState?: MovieDataState;
  onRetry?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ movies, loading, error: propError, dataState, onRetry }) => {
  const { clearSearch, searchQuery, sortedMovies } = useHomePageMovies(movies);

  if (loading && movies.length === 0) {
    return <HomePageLoadingState fullPage />;
  }

  return (
    <div className="page-shell">

      {propError && (
        <Card className="status-banner status-banner-danger shadow-none">
          <p role="alert">We couldn&apos;t load the latest listings. {propError}</p>
          {onRetry && <button className="text-sm font-semibold" onClick={onRetry} disabled={loading}>Try again</button>}
        </Card>
      )}

      {!loading && searchQuery.trim() && sortedMovies.length > 0 && (
        <p className="text-xs" style={{ color: 'rgb(var(--text-soft))' }}>
          {searchQuery.trim()
            ? `${sortedMovies.length} of ${movies.length} films matching "${searchQuery}"`
            : `${sortedMovies.length} film${sortedMovies.length !== 1 ? 's' : ''}`}
        </p>
      )}

      {loading && movies.length > 0 && <p role="status" className="body-muted">Refreshing listings…</p>}
      {loading && movies.length === 0 ? (
        <HomePageLoadingState />
      ) : sortedMovies.length === 0 ? (
        <HomePageEmptyState onClearSearch={clearSearch} searchQuery={searchQuery} dataState={dataState} failed={!!propError} />
      ) : (
        <HomeMovieGrid movies={sortedMovies} />
      )}
    </div>
  );
};

export default HomePage;
