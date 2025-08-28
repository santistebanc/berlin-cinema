import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Film } from 'lucide-react';
import { Movie } from '../types';

interface HomePageProps {
  movies: Movie[];
  loading: boolean;
  error: string | null;
}

const HomePage: React.FC<HomePageProps> = ({ movies, loading, error: propError }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();



  // Calculate total showtimes for a movie
  const getTotalShowtimes = (movie: Movie | undefined): number => {
    if (!movie?.showings || typeof movie.showings !== 'object' || Array.isArray(movie.showings)) {
      return 0;
    }
    
    let total = 0;
    Object.values(movie.showings).forEach(dateShowings => {
      if (dateShowings && typeof dateShowings === 'object') {
        Object.values(dateShowings).forEach(timeShowings => {
          if (Array.isArray(timeShowings)) {
            total += timeShowings.length;
          }
        });
      }
    });
    return total;
  };

  // Sort movies by total showtimes (descending)
  const sortMoviesByShowtimes = (movies: Movie[]): Movie[] => {
    if (!movies || movies.length === 0) {
      return [];
    }
    
    return [...movies].sort((a, b) => {
      const aShowtimes = getTotalShowtimes(a);
      const bShowtimes = getTotalShowtimes(b);
      return bShowtimes - aShowtimes; // Descending order (most showtimes first)
    });
  };

  // Fuzzy search function for filtering movies
  const fuzzySearch = (query: string, movies: Movie[]): Movie[] => {
    if (!movies || movies.length === 0) {
      return [];
    }
    
    if (!query.trim()) return movies;
    
    const searchTerm = query.toLowerCase().trim();
    
    return movies.filter(movie => {
      if (!movie) return false;
      
      // Search in title
      if (movie.title?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in director
      if (movie.director?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in cast
      if (movie.cast?.some(actor => actor?.toLowerCase().includes(searchTerm))) return true;
      
      // Search in variants
      if (movie.variants?.some(variant => variant?.toLowerCase().includes(searchTerm))) return true;
      
      // Search in country
      if (movie.country?.toLowerCase().includes(searchTerm)) return true;
      
      return false;
    });
  };

  // Get filtered movies based on search query
  const filteredMovies = useMemo(() => {
    if (!movies || movies.length === 0) return [];
    return fuzzySearch(searchQuery, movies);
  }, [searchQuery, movies]);
  
  // Sort filtered movies by showtimes
  const sortedFilteredMovies = useMemo(() => {
    if (!filteredMovies || filteredMovies.length === 0) return [];
    return sortMoviesByShowtimes(filteredMovies);
  }, [filteredMovies]);





  // Read search query from URL and update when it changes
  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    } else {
      setSearchQuery('');
    }
  }, [searchParams]);

  const handleMovieClick = (movie: Movie) => {
    // Navigate to the movie detail page
    navigate(`/movie/${encodeURIComponent(movie.title)}`);
  };



  if (loading && movies.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cinema-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading movies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Error Message */}
      {propError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{propError}</p>
        </div>
      )}

      {/* Movie Selection Menu */}
      <div className="mb-8">


        {/* Search Results Summary */}
        {searchQuery && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-blue-600">🔍</span>
                <span className="text-blue-800">
                  Found {sortedFilteredMovies.length} movie{sortedFilteredMovies.length !== 1 ? 's' : ''} matching "{searchQuery}"
                </span>
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  navigate('/', { replace: true });
                }}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Clear search
              </button>
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cinema-600"></div>
          </div>
        ) : sortedFilteredMovies.length === 0 ? (
          <div className="text-center py-8">
            <Film className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchQuery 
                ? `No movies found matching "${searchQuery}". Try a different search term.`
                : 'No movies found.'
              }
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  navigate('/', { replace: true });
                }}
                className="mt-4 px-4 py-2 bg-cinema-600 text-white rounded-lg hover:bg-cinema-700 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedFilteredMovies.map((movie) => (
              <div
                key={movie.title}
                onClick={() => handleMovieClick(movie)}
                className="cursor-pointer rounded-lg border-2 border-gray-200 bg-white transition-all duration-200 hover:shadow-lg hover:border-cinema-300"
              >
                {/* Movie Poster */}
                <div className="relative">
                  <img
                    src={movie.posterUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+'}
                    alt={movie.title}
                    className="w-full h-32 object-cover rounded-t-lg"
                                          onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+';
                      }}
                  />
                  
                    
                </div>
                
                {/* Movie Info */}
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">
                    {movie.title}
                  </h3>
                  
                  {/* Variant Badges */}
                  {movie.variants && movie.variants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {movie.variants.map((variant, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300 rounded-md">
                          {variant}
                        </span>
                      ))}
                    </div>
                  )}
                  

                  
                  {/* Showtimes Count */}
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-600">
                      🎬 {getTotalShowtimes(movie)} showtime{getTotalShowtimes(movie) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
