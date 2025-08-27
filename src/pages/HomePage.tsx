import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Film } from 'lucide-react';
import { movieApi } from '../services/api';
import { Movie } from '../types';

const HomePage: React.FC = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Fuzzy search function
  const fuzzySearch = (query: string, movies: Movie[]): Movie[] => {
    if (!query.trim()) return movies;
    
    const searchTerm = query.toLowerCase().trim();
    
    return movies.filter(movie => {
      // Search in title
      if (movie.title.toLowerCase().includes(searchTerm)) return true;
      
      // Search in director
      if (movie.director && movie.director.toLowerCase().includes(searchTerm)) return true;
      
      // Search in cast
      if (movie.cast && movie.cast.some(actor => 
        actor.toLowerCase().includes(searchTerm)
      )) return true;
      
      // Search in variants
      if (movie.variants && movie.variants.some(variant => 
        variant.toLowerCase().includes(searchTerm)
      )) return true;
      
      // Search in country
      if (movie.country && movie.country.toLowerCase().includes(searchTerm)) return true;
      
      return false;
    });
  };

  // Calculate total showtimes for a movie
  const getTotalShowtimes = (movie: Movie): number => {
    let total = 0;
    movie.cinemas.forEach(cinema => {
      cinema.showtimes.forEach(showtime => {
        total += showtime.times.length;
      });
    });
    return total;
  };

  // Sort movies by total showtimes (descending)
  const sortMoviesByShowtimes = (movies: Movie[]): Movie[] => {
    return [...movies].sort((a, b) => {
      const aShowtimes = getTotalShowtimes(a);
      const bShowtimes = getTotalShowtimes(b);
      return bShowtimes - aShowtimes; // Descending order (most showtimes first)
    });
  };

  // Get filtered movies based on search
  const filteredMovies = fuzzySearch(searchQuery, movies);
  
  // Sort filtered movies by showtimes
  const sortedFilteredMovies = sortMoviesByShowtimes(filteredMovies);

  // Merge movies with same title but different language versions
    const getMergedMovies = (rawMovies: Movie[]) => {
    const movieGroups: { [baseTitle: string]: Movie[] } = {};
    
    // Helper function to get base title (remove all variants and language suffixes)
    const getBaseTitle = (title: string) => {
      return title
        .replace(/\s*\(OV\s*w\/\s*sub\)/i, '')
        .replace(/\s*\(OV\)/i, '')
        .replace(/\s*\(OmU\)/i, '')
        .replace(/\s*\(OV\/OmU\)/i, '')
        .replace(/\s*\(Original\s*Version\)/i, '')
        .replace(/\s*\(Original\s*Version\s*w\/\s*sub\)/i, '')
        .replace(/\s*\(Imax\)/i, '')
        .replace(/\s*\(EXPN\)/i, '')
        .replace(/\s*\(3D\)/i, '')
        .replace(/\s*\(4DX\)/i, '')
        .replace(/\s*\(Dolby\s*Atmos\)/i, '')
        .replace(/\s*\(Premium\s*Large\s*Format\)/i, '')
        .trim();
    };

    // Helper function to extract variant tags
    const extractVariants = (title: string) => {
      const variants: string[] = [];
      
      // More flexible pattern to catch all variants in parentheses
      const allVariantsPattern = /\([^)]+\)/g;
      const matches = title.match(allVariantsPattern);
      
      if (matches) {
        // Remove parentheses from each variant and clean up specific variants
        const cleanVariants = matches.map(match => {
          let variant = match.replace(/^\(|\)$/g, '');
          // Replace "OV w/ sub" with just "sub"
          if (variant.toLowerCase() === 'ov w/ sub') {
            variant = 'sub';
          }
          return variant;
        });
        variants.push(...cleanVariants);
      }
      
      return variants;
    };
    
    // Group movies by their base title (without variants)
    rawMovies.forEach(movie => {
      const baseTitle = getBaseTitle(movie.title);
      
      if (!movieGroups[baseTitle]) {
        movieGroups[baseTitle] = [];
      }
      movieGroups[baseTitle].push(movie);
    });
    
    return Object.values(movieGroups).map(group => {
      if (group.length === 1) {
        // Clean the title for single movies too
        const baseMovie = group[0];
        return {
          ...baseMovie,
          title: getBaseTitle(baseMovie.title)
        };
      }
      

      
      // Merge multiple versions of the same movie
      const baseMovie = group[0];
      
      // Create a map to track all showtimes by date and time, regardless of cinema
      const showtimeMap: { [date: string]: { [time: string]: { cinema: string, language: string, variants: string[], originalMovie: Movie }[] } } = {};
      
      group.forEach(movie => {
        movie.cinemas.forEach(cinema => {
          cinema.showtimes.forEach(showtime => {
            if (!showtimeMap[showtime.date]) {
              showtimeMap[showtime.date] = {};
            }
            
            showtime.times.forEach(time => {
              if (!showtimeMap[showtime.date][time]) {
                showtimeMap[showtime.date][time] = [];
              }
              showtimeMap[showtime.date][time].push({
                cinema: cinema.name,
                language: movie.language,
                variants: extractVariants(movie.title),
                originalMovie: movie
              });
            });
          });
        });
      });
      

      
      // Convert the map back to the expected format
      const mergedCinemas = [{
        id: 'merged',
        name: 'All Cinemas',
        address: '',
        city: '',
        postalCode: '',
        url: '',
        showtimes: Object.entries(showtimeMap).map(([date, times]) => ({
          date,
          times: Object.keys(times),
          dayOfWeek: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
          // Store the complete info for each time
          timeInfo: times
        }))
      }];
      
      // Collect all unique variants from all movies in the group
      const allVariants = new Set<string>();
      group.forEach(movie => {
        const variants = extractVariants(movie.title);
        variants.forEach(variant => allVariants.add(variant));
      });
      
      const mergedMovie: Movie & { cinemas: typeof mergedCinemas } = {
        ...baseMovie,
        title: getBaseTitle(baseMovie.title), // Use clean title
        id: group.map(m => m.id).join('-'),
        language: group.map(m => m.language).join('/'),
        variants: Array.from(allVariants).sort(), // Store all variants
        cinemas: mergedCinemas
      };
      

      
      return mergedMovie;
    });
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const moviesResult = await movieApi.getAllMovies();
      
      if (!moviesResult.movies || moviesResult.movies.length === 0) {
        console.error('No movies found in API response');
        setError('No movies data received from API');
        return;
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
          <h2 className="text-xl font-semibold text-gray-900">Select a Movie</h2>
          <span className="text-gray-600">{sortedFilteredMovies.length} of {movies.length} movies (ordered by showtimes)</span>
        </div>
        
        {/* Search Input */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search movies, directors, actors, variants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cinema-500 focus:border-cinema-500 focus:outline-none transition-colors"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400 text-lg">🔍</span>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Search Tips */}
          {!searchQuery && (
            <p className="text-sm text-gray-500 mt-2">
              💡 Search by movie title, director, actor, variant (Imax, EXPN), or country
            </p>
          )}
          
          {/* Search Results Summary */}
          {searchQuery && (
            <div className="mt-2 text-sm text-gray-600">
              {sortedFilteredMovies.length === movies.length ? (
                <span className="text-green-600">✓ Showing all movies</span>
              ) : (
                <span className="text-blue-600">
                  🔍 Found {sortedFilteredMovies.length} movie{filteredMovies.length !== 1 ? 's' : ''} matching "{searchQuery}"
                </span>
              )}
            </div>
          )}
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cinema-600"></div>
          </div>
        ) : sortedFilteredMovies.length === 0 ? (
          <div className="text-center py-8">
            <Film className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchQuery ? `No movies found matching "${searchQuery}"` : 'No movies found.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedFilteredMovies.map((movie) => (
              <div
                key={movie.id}
                onClick={() => handleMovieClick(movie)}
                className="cursor-pointer rounded-lg border-2 border-gray-200 bg-white transition-all duration-200 hover:shadow-lg hover:border-cinema-300"
              >
                {/* Movie Poster */}
                <div className="relative">
                  <img
                    src={movie.posterUrl}
                    alt={movie.title}
                    className="w-full h-32 object-cover rounded-t-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="192" viewBox="0 0 128 192"><rect width="128" height="192" fill="#f3f4f6"/><text x="64" y="96" font-family="Arial, sans-serif" font-size="14" fill="#6b7280" text-anchor="middle">🎬</text><text x="64" y="120" font-family="Arial, sans-serif" font-size="12" fill="#6b7280" text-anchor="middle">${movie.title}</text></svg>`;
                      target.src = `data:image/svg+xml,${encodeURIComponent(fallbackSvg)}`;
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
                      {movie.variants.slice(0, 3).map((variant, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 rounded">
                          {variant}
                        </span>
                      ))}
                      {movie.variants.length > 3 && (
                        <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 rounded">
                          +{movie.variants.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* FSK Rating */}
                  {movie.fskRating > 0 && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      FSK {movie.fskRating}
                    </span>
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
