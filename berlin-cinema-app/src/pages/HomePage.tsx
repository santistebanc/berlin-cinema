import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Film } from 'lucide-react';
import { movieApi } from '../services/api';
import { Movie } from '../types';

const HomePage: React.FC = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Merge movies with same title but different language versions
  const getMergedMovies = () => {
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
      
      console.log('Extracting variants from title:', title);
      if (matches) {
        console.log('Found all variants:', matches);
        variants.push(...matches);
      }
      console.log('Extracted variants:', variants);
      
      return variants;
    };
    
    console.log('Processing movies for merging:', movies.map(m => ({ title: m.title, baseTitle: getBaseTitle(m.title) })));
    
    movies.forEach(movie => {
      const baseTitle = getBaseTitle(movie.title);
      if (!movieGroups[baseTitle]) {
        movieGroups[baseTitle] = [];
      }
      movieGroups[baseTitle].push(movie);
    });
    
    return Object.values(movieGroups).map(group => {
      if (group.length === 1) {
        return group[0];
      }
      
      // Debug logging
      console.log('Merging movie group:', {
        baseTitle: getBaseTitle(group[0].title),
        count: group.length,
        versions: group.map(m => ({ title: m.title, language: m.language }))
      });
      
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
      
      // Debug logging for showtime map
      console.log('Showtime map for', getBaseTitle(baseMovie.title), ':', showtimeMap);
      
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
      
      // Debug logging for variants
      console.log('Extracted variants for', getBaseTitle(baseMovie.title), ':', Array.from(allVariants));

      const mergedMovie: Movie & { cinemas: typeof mergedCinemas } = {
        ...baseMovie,
        title: getBaseTitle(baseMovie.title), // Use clean title
        id: group.map(m => m.id).join('-'),
        language: group.map(m => m.language).join('/'),
        variants: Array.from(allVariants).sort(), // Store all variants
        cinemas: mergedCinemas
      };
      
      console.log('Created merged movie:', {
        title: mergedMovie.title,
        variants: mergedMovie.variants,
        language: mergedMovie.language
      });
      
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
      
      console.log('Raw movies from API:', moviesResult.movies);
      setMovies(moviesResult.movies);
      setError(null);
    } catch (err) {
      setError('Failed to load movies. Please try again later.');
      console.error('Error loading data:', err);
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
          <span className="text-gray-600">{getMergedMovies().length} movies available</span>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cinema-600"></div>
          </div>
        ) : movies.length === 0 ? (
          <div className="text-center py-8">
            <Film className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No movies found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {getMergedMovies().map((movie) => (
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
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjMWYyOTM3Ii8+Cjx0ZXh0IHg9IjY0IiB5PSI5NiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4=';
                    }}
                  />
                  
                                      {/* Language Badge */}
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-cinema-600 text-white">
                        {movie.language}
                      </span>
                    </div>
                    
                    {/* Variant Badges */}
                    {movie.variants && movie.variants.length > 0 && (
                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        {movie.variants.slice(0, 2).map((variant, idx) => (
                          <span key={idx} className="px-1 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 rounded">
                            {variant}
                          </span>
                        ))}
                        {movie.variants.length > 2 && (
                          <span className="px-1 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 rounded">
                            +{movie.variants.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                </div>
                
                {/* Movie Info */}
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">
                    {movie.title}
                  </h3>
                  
                  {/* FSK Rating */}
                  {movie.fskRating > 0 && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      FSK {movie.fskRating}
                    </span>
                  )}
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
