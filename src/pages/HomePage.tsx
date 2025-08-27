import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Film } from 'lucide-react';
import { movieApi } from '../services/api';
import { Movie } from '../types';

const HomePage: React.FC = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();



  // Calculate total showtimes for a movie
  const getTotalShowtimes = (movie: Movie | undefined): number => {
    try {
      console.log('🔍 getTotalShowtimes called with:', movie);
      
      // Safety check: if movie is undefined, return 0
      if (!movie) {
        console.log('❌ Movie is undefined, returning 0');
        return 0;
      }
      
      console.log('📽️ Movie title:', movie.title);
      console.log('🎬 Movie showings:', movie.showings);
      console.log('🔍 Type of showings:', typeof movie.showings);
      console.log('🔍 Is array?', Array.isArray(movie.showings));
      
      // New data structure: movie.showings is organized by date -> time -> cinema+variant
      if (movie.showings && typeof movie.showings === 'object' && !Array.isArray(movie.showings)) {
        console.log('✅ Showings structure is valid, processing...');
        let total = 0;
        
        const dateKeys = Object.keys(movie.showings);
        console.log('📅 Date keys:', dateKeys);
        
        dateKeys.forEach((dateKey, dateIndex) => {
          console.log(`📅 Processing date ${dateIndex}: ${dateKey}`);
          const dateShowings = movie.showings[dateKey];
          console.log(`🎬 Date showings for ${dateKey}:`, dateShowings);
          
          if (dateShowings && typeof dateShowings === 'object') {
            const timeKeys = Object.keys(dateShowings);
            console.log(`⏰ Time keys for ${dateKey}:`, timeKeys);
            
            timeKeys.forEach((timeKey, timeIndex) => {
              console.log(`⏰ Processing time ${timeIndex}: ${timeKey}`);
              const timeShowings = dateShowings[timeKey];
              console.log(`🎭 Time showings for ${timeKey}:`, timeShowings);
              
              if (Array.isArray(timeShowings)) {
                console.log(`✅ Adding ${timeShowings.length} showings from ${timeKey}`);
                total += timeShowings.length;
              } else {
                console.log(`❌ Time showings is not an array:`, timeShowings);
              }
            });
          } else {
            console.log(`❌ Date showings is not an object:`, dateShowings);
          }
        });
        
        console.log(`🎯 Total showings calculated: ${total}`);
        return total;
      } else {
        console.log('❌ Showings structure is invalid');
        return 0;
      }
    } catch (error) {
      console.error(`💥 Error calculating showtimes for movie "${movie?.title}":`, error);
      console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return 0;
    }
  };

  // Sort movies by total showtimes (descending)
  const sortMoviesByShowtimes = (movies: Movie[]): Movie[] => {
    try {
      console.log('🔄 sortMoviesByShowtimes called with:', movies);
      console.log('🔍 Movies length:', movies?.length);
      console.log('🔍 First movie:', movies?.[0]);
      
      // Safety check: if movies array is empty or undefined, return empty array
      if (!movies || movies.length === 0) {
        console.log('❌ Movies array is empty or undefined, returning empty array');
        return [];
      }
      
      console.log('✅ Starting to sort movies...');
      const sorted = [...movies].sort((a, b) => {
        console.log(`🔄 Comparing movies: "${a?.title}" vs "${b?.title}"`);
        const aShowtimes = getTotalShowtimes(a);
        const bShowtimes = getTotalShowtimes(b);
        console.log(`🎯 Showtimes: ${aShowtimes} vs ${bShowtimes}`);
        return bShowtimes - aShowtimes; // Descending order (most showtimes first)
      });
      
      console.log('✅ Sorting completed successfully');
      return sorted;
    } catch (error) {
      console.error('💥 Error sorting movies by showtimes:', error);
      console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Return original array if sorting fails
      return [...movies];
    }
  };

  // Fuzzy search function for filtering movies
  const fuzzySearch = (query: string, movies: Movie[]): Movie[] => {
    // Safety check: if movies array is empty or undefined, return empty array
    if (!movies || movies.length === 0) {
      return [];
    }
    
    if (!query.trim()) return movies;
    
    const searchTerm = query.toLowerCase().trim();
    
    return movies.filter(movie => {
      // Safety check: if movie is undefined, skip it
      if (!movie) return false;
      
      // Search in title
      if (movie.title && movie.title.toLowerCase().includes(searchTerm)) return true;
      
      // Search in director
      if (movie.director && movie.director.toLowerCase().includes(searchTerm)) return true;
      
      // Search in cast
      if (movie.cast && movie.cast.some(actor => 
        actor && actor.toLowerCase().includes(searchTerm)
      )) return true;
      
      // Search in variants
      if (movie.variants && movie.variants.some(variant => 
        variant && variant.toLowerCase().includes(searchTerm)
      )) return true;
      
      // Search in country
      if (movie.country && movie.country.toLowerCase().includes(searchTerm)) return true;
      
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

  // Backend now provides merged movies, no need for frontend processing
  const getMergedMovies = (rawMovies: Movie[]) => {
    // Backend already merges movies and provides clean data
    return rawMovies;
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Read search query from URL and update when it changes
  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    } else {
      setSearchQuery('');
    }
  }, [searchParams]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const moviesResult = await movieApi.getAllMovies();
      
      if (!moviesResult.movies || moviesResult.movies.length === 0) {
        console.error('No movies found in API response');
        setError('No movies data received from API');
        return;
      }
      
      console.log('Movies API response:', moviesResult);
      console.log('Total movies received:', moviesResult.movies.length);
      console.log('First movie structure:', moviesResult.movies[0]);
      
      // Debug: Check for movies with missing or malformed showings
      const moviesWithIssues = moviesResult.movies.filter(movie => 
        !movie.showings || typeof movie.showings !== 'object' || Array.isArray(movie.showings)
      );
      if (moviesWithIssues.length > 0) {
        console.warn(`Found ${moviesWithIssues.length} movies with showings issues:`, moviesWithIssues.map(m => ({ title: m.title, showings: m.showings })));
      }
      
      const mergedMovies = getMergedMovies(moviesResult.movies);
      
      setMovies(mergedMovies);
      setError(null);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(`Failed to load movies: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

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
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Movie Selection Menu */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {searchQuery ? `Search Results for "${searchQuery}"` : 'Select a Movie'}
          </h2>
          <span className="text-gray-600">
            {searchQuery 
              ? `Found ${sortedFilteredMovies.length} movie${sortedFilteredMovies.length !== 1 ? 's' : ''} matching "${searchQuery}"`
              : `${sortedFilteredMovies.length} of ${movies.length} movies (ordered by showtimes)`
            }
          </span>
        </div>
        
        {/* Search Results Summary */}
        {searchQuery && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-blue-600">🔍</span>
                <span className="text-blue-800">
                  Showing results for: <strong>"{searchQuery}"</strong>
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
                    src={movie.posterUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPg=='}
                    alt={movie.title}
                    className="w-full h-32 object-cover rounded-t-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPg==';
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
