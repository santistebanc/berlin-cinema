import React from 'react';
import { Movie } from '../types';
import HomeMovieGrid from '../components/home/HomeMovieGrid';
import HomePageEmptyState from '../components/home/HomePageEmptyState';
import HomePageLoadingState from '../components/home/HomePageLoadingState';
import SearchResultsSummary from '../components/home/SearchResultsSummary';
import Card from '../components/ui/Card';
import { useHomePageMovies } from '../hooks/useHomePageMovies';

interface HomePageProps {
  movies: Movie[];
  loading: boolean;
  error: string | null;
}

const HomePage: React.FC<HomePageProps> = ({ movies, loading, error: propError }) => {
  const { clearSearch, searchQuery, sortedMovies } = useHomePageMovies(movies);
  const resultsLabel = `${sortedMovies.length} film${sortedMovies.length !== 1 ? 's' : ''}`;

  if (loading && movies.length === 0) {
    return <HomePageLoadingState fullPage />;
  }

  return (
    <div className="page-shell">

      {propError && (
        <Card className="status-banner status-banner-danger shadow-none">
          <p>We couldn&apos;t load the latest listings. {propError}</p>
        </Card>
      )}

      <SearchResultsSummary
        count={sortedMovies.length}
        onClearSearch={clearSearch}
        searchQuery={searchQuery}
      />

      {loading ? (
        <HomePageLoadingState />
      ) : sortedMovies.length === 0 ? (
        <HomePageEmptyState onClearSearch={clearSearch} searchQuery={searchQuery} />
      ) : (
        <HomeMovieGrid movies={sortedMovies} />
      )}
    </div>
  );
};

export default HomePage;
