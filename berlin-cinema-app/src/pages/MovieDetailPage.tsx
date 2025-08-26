import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, ExternalLink, Filter, X, Globe, Calendar } from 'lucide-react';
import { movieApi } from '../services/api';
import { Movie } from '../types';

const MovieDetailPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [selectedCinemas, setSelectedCinemas] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Popup state
  const [selectedCinemaForPopup, setSelectedCinemaForPopup] = useState<{ name: string, address: string, city: string, postalCode: string, url: string } | null>(null);
  const [showCinemaPopup, setShowCinemaPopup] = useState(false);

  // Generate unique colors for each cinema
  const getCinemaColors = () => {
    if (!movie) return {};
    
    const cinemaColors: { [key: string]: string } = {};
    const colors = [
      'bg-red-100 text-red-800 border-red-200',
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-green-100 text-green-800 border-green-200',
      'bg-yellow-100 text-yellow-800 border-yellow-200',
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-pink-100 text-pink-800 border-pink-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
      'bg-teal-100 text-teal-800 border-teal-200',
      'bg-orange-100 text-orange-800 border-orange-200',
      'bg-cyan-100 text-cyan-800 border-cyan-200',
      'bg-lime-100 text-lime-800 border-lime-200',
      'bg-amber-100 text-amber-800 border-amber-200',
      'bg-emerald-100 text-emerald-800 border-emerald-200',
      'bg-violet-100 text-violet-800 border-violet-200',
      'bg-rose-100 text-rose-800 border-rose-200',
      'bg-sky-100 text-sky-800 border-sky-200'
    ];
    
    let colorIndex = 0;
    
    // For merged movies, we need to get all unique cinema names from the timeInfo
    if (movie.cinemas.length > 0 && (movie.cinemas[0] as any).timeInfo) {
      // This is a merged movie, collect all cinema names from showtimes
      const allCinemaNames = new Set<string>();
      movie.cinemas.forEach(cinema => {
        cinema.showtimes.forEach(showtime => {
          if ((showtime as any).timeInfo) {
            Object.values((showtime as any).timeInfo).forEach((timeSlots: any) => {
              timeSlots.forEach((showing: any) => {
                allCinemaNames.add(showing.cinema);
              });
            });
          }
        });
      });
      
      // Assign colors to all unique cinema names
      Array.from(allCinemaNames).sort().forEach(cinemaName => {
        if (!cinemaColors[cinemaName]) {
          cinemaColors[cinemaName] = colors[colorIndex % colors.length];
          colorIndex++;
        }
      });
    } else {
      // Regular movie, use cinemas array
      movie.cinemas.forEach(cinema => {
        if (!cinemaColors[cinema.name]) {
          cinemaColors[cinema.name] = colors[colorIndex % colors.length];
          colorIndex++;
        }
      });
    }
    
    return cinemaColors;
  };

  // Get available cinemas, dates, and variants for filters
  const getAvailableFilters = () => {
    if (!movie) return { cinemas: [], dates: [], variants: [] };
    
    console.log('Getting available filters for movie:', movie.title, 'with variants:', movie.variants);
    
    const cinemas = new Set<string>();
    const dates = new Set<string>();
    const variants = new Set<string>();
    
    if (movie.cinemas.length > 0 && (movie.cinemas[0] as any).timeInfo) {
      // Merged movie - extract from timeInfo
      movie.cinemas.forEach(cinema => {
        cinema.showtimes.forEach(showtime => {
          dates.add(showtime.date);
          if ((showtime as any).timeInfo) {
            Object.values((showtime as any).timeInfo).forEach((timeSlots: any) => {
              timeSlots.forEach((showing: any) => {
                cinemas.add(showing.cinema);
                if (showing.variants) {
                  console.log('Found showing variants:', showing.variants);
                  showing.variants.forEach((variant: string) => variants.add(variant));
                }
              });
            });
          }
        });
      });
    } else {
      // Regular movie
      movie.cinemas.forEach(cinema => {
        cinemas.add(cinema.name);
        cinema.showtimes.forEach(showtime => {
          dates.add(showtime.date);
        });
      });
    }
    
    // Add movie variants if available
    if (movie.variants) {
      console.log('Adding movie variants to filters:', movie.variants);
      movie.variants.forEach(variant => variants.add(variant));
    }
    
    const result = {
      cinemas: Array.from(cinemas).sort(),
      dates: Array.from(dates).sort(),
      variants: Array.from(variants).sort()
    };
    
    console.log('Final filter result:', result);
    return result;
  };

  // Initialize filters when movie data loads
  useEffect(() => {
    if (movie) {
      console.log('Movie loaded:', {
        title: movie.title,
        variants: movie.variants,
        cinemas: movie.cinemas
      });
      const { cinemas, dates, variants } = getAvailableFilters();
      console.log('Available filters:', { cinemas, dates, variants });
      setSelectedCinemas(cinemas);
      setSelectedDates(dates);
      setSelectedVariants(variants);
    }
  }, [movie]);

  useEffect(() => {
    if (title) {
      loadMovieData(decodeURIComponent(title));
    }
  }, [title]);

  const loadMovieData = async (movieTitle: string) => {
    try {
      setLoading(true);
      const moviesResult = await movieApi.getAllMovies();
      
      // Find the movie by title (handle merged movies)
      const allMovies = moviesResult.movies;
      const movieGroups: { [baseTitle: string]: Movie[] } = {};
      
      // Helper function to get base title (remove language suffixes)
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
      
      allMovies.forEach(movie => {
        const baseTitle = getBaseTitle(movie.title);
        if (!movieGroups[baseTitle]) {
          movieGroups[baseTitle] = [];
        }
        movieGroups[baseTitle].push(movie);
      });
      
      // Find the movie group that matches the requested title
      const targetBaseTitle = getBaseTitle(movieTitle);
      const movieGroup = movieGroups[targetBaseTitle];
      
      if (movieGroup && movieGroup.length > 0) {
        if (movieGroup.length === 1) {
          // For single movies, also extract variants and set them
          const singleMovie = movieGroup[0];
          const variants = extractVariants(singleMovie.title);
          const cleanTitle = getBaseTitle(singleMovie.title);
          console.log('Single movie variants for', singleMovie.title, ':', variants);
          setMovie({
            ...singleMovie,
            title: cleanTitle, // Use cleaned title without variants
            variants: variants
          });
        } else {
          // Merge multiple versions of the same movie
          const baseMovie = movieGroup[0];
          
          // Create a map to track all showtimes by date and time, regardless of cinema
          const showtimeMap: { [date: string]: { [time: string]: { cinema: string, language: string, variants: string[], originalMovie: Movie }[] } } = {};
          
          movieGroup.forEach(movie => {
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
          
          // Collect all unique variants from all movies in the group
          const allVariants = new Set<string>();
          movieGroup.forEach(movie => {
            const variants = extractVariants(movie.title);
            console.log('Variants for movie', movie.title, ':', variants);
            variants.forEach(variant => allVariants.add(variant));
          });
          
          console.log('Collected variants for merged movie:', Array.from(allVariants));
          
          // Collect all unique cinemas from the movie group
          const allCinemas = new Map<string, { id: string, name: string, address: string, city: string, postalCode: string, url: string }>();
          
          movieGroup.forEach(movie => {
            movie.cinemas.forEach(cinema => {
              if (!allCinemas.has(cinema.name)) {
                allCinemas.set(cinema.name, {
                  id: cinema.id,
                  name: cinema.name,
                  address: cinema.address,
                  city: cinema.city,
                  postalCode: cinema.postalCode,
                  url: cinema.url
                });
              }
            });
          });
          
          // Convert the map back to the expected format, preserving individual cinemas
          const mergedCinemas = Array.from(allCinemas.values()).map(cinema => ({
            ...cinema,
            showtimes: Object.entries(showtimeMap).map(([date, times]) => ({
              date,
              times: Object.keys(times),
              dayOfWeek: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
              // Store the complete info for each time
              timeInfo: times
            }))
          }));
          
          const mergedMovie: Movie & { cinemas: typeof mergedCinemas } = {
            ...baseMovie,
            title: targetBaseTitle, // Use clean title
            id: movieGroup.map(m => m.id).join('-'),
            language: movieGroup.map(m => m.language).join('/'),
            variants: Array.from(allVariants).sort(), // Store all variants
            cinemas: mergedCinemas
          };
          
          setMovie(mergedMovie);
        }
        setError(null);
      } else {
        setError('Movie not found');
      }
    } catch (err) {
      setError('Failed to load movie information');
      console.error('Error loading movie data:', err);
    } finally {
      setLoading(false);
    }
  };



  const toggleCinema = (cinema: string) => {
    setSelectedCinemas(prev => 
      prev.includes(cinema) 
        ? prev.filter(c => c !== cinema)
        : [...prev, cinema]
    );
  };

    const toggleDate = (date: string) => {
    setSelectedDates(prev =>
      prev.includes(date)
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const toggleVariant = (variant: string) => {
    setSelectedVariants(prev =>
      prev.includes(variant)
        ? prev.filter(v => v !== variant)
        : [...prev, variant]
    );
  };

  // Handle cinema badge click to show popup
  const handleCinemaClick = (cinemaName: string) => {
    const cinema = movie?.cinemas.find(c => c.name === cinemaName);
    if (cinema) {
      setSelectedCinemaForPopup({
        name: cinema.name,
        address: cinema.address,
        city: cinema.city,
        postalCode: cinema.postalCode,
        url: cinema.url
      });
      setShowCinemaPopup(true);
    }
  };

  // Close popup when clicking outside
  const handlePopupOutsideClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setShowCinemaPopup(false);
      setSelectedCinemaForPopup(null);
    }
  };

  // Reset all filters
  const resetFilters = () => {
    const { cinemas, dates, variants } = getAvailableFilters();
    setSelectedCinemas(cinemas);
    setSelectedDates(dates);
    setSelectedVariants(variants);
  };

  // Check if a showing should be displayed based on filters
    const shouldShowShowing = (showing: any) => {
    const cinemaMatch = selectedCinemas.includes(showing.cinema);
    const variantMatch = !showing.variants || showing.variants.length === 0 || 
                        showing.variants.some((variant: string) => selectedVariants.includes(variant));
    
    return cinemaMatch && variantMatch;
  };

  // Check if a date should be displayed
  const shouldShowDate = (date: string) => {
    return selectedDates.includes(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cinema-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading movie information...</p>
        </div>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Movie Not Found</h2>
        <p className="text-gray-600 mb-6">{error || 'The requested movie could not be found.'}</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-cinema-600 text-white rounded-lg hover:bg-cinema-700 transition-colors"
        >
          ← Back to Movies
        </button>
      </div>
    );
  }

  const { cinemas, dates, variants } = getAvailableFilters();

  return (
    <div className="w-full px-4 space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center text-cinema-600 hover:text-cinema-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Movies
      </button>

      {/* Movie Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start space-x-4">
            {/* Movie Poster */}
            <div className="flex-shrink-0">
              <img
                src={movie.posterUrl}
                alt={movie.title}
                className="w-20 h-30 object-cover rounded-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjMWYyOTM3Ii8+Cjx0ZXh0IHg9IjY0IiB5PSI5NiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4=';
                }}
              />
            </div>
            
            {/* Movie Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-gray-900 mb-3">{movie.title}</h1>
              
              {/* Movie Details */}
              <div className="mb-4 space-y-2">
                {/* Movie ID and Language */}
                <div className="flex items-center text-sm text-gray-500 space-x-4">
                  {movie.id && (
                    <span>ID: {movie.id}</span>
                  )}
                  {movie.language && (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                      {movie.language}
                    </span>
                  )}
                </div>
                
                {/* Year and Country */}
                {(movie.year > 0 || movie.country) && (
                  <div className="flex items-center text-sm text-gray-600">
                    {movie.country && (
                      <span className="mr-3">
                        <Globe className="h-4 w-4 inline mr-1" />
                        {movie.country}
                      </span>
                    )}
                    {movie.year > 0 && (
                      <span>
                        <Calendar className="h-4 w-4 inline mr-1" />
                        {movie.year}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Director */}
                {movie.director && (
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Director:</span> {movie.director}
                  </div>
                )}
                
                {/* Cast */}
                {movie.cast && movie.cast.length > 0 && (
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Cast:</span> {movie.cast.join(', ')}
                  </div>
                )}
              </div>
              
              {/* Badges and Links */}
              <div className="flex items-center space-x-3 mb-4">
                {/* Variants Badge */}
                {movie.variants && movie.variants.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {movie.variants.map((variant, idx) => (
                      <span key={idx} className="px-3 py-1 rounded-md text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200">
                        {variant}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    No variants
                  </span>
                )}
                
                {movie.fskRating > 0 && (
                  <span className="px-2 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800">
                    FSK {movie.fskRating}
                  </span>
                )}
              </div>
              
              {/* Action Links */}
              <div className="flex items-center space-x-3">
                {movie.trailerUrl && (
                  <a
                    href={movie.trailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-cinema-600 text-white text-sm rounded-md hover:bg-cinema-700 transition-colors"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Trailer
                  </a>
                )}
                
                {movie.reviewUrl && (
                  <a
                    href={movie.reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Review
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Filters Section */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cinema-500"
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
          </div>
          
          {showFilters && (
            <div className="space-y-4">

              
              {/* Cinema Filters */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Cinemas</h4>
                <div className="flex flex-wrap gap-2">
                  {cinemas.map(cinema => (
                    <button
                      key={cinema}
                      onClick={() => toggleCinema(cinema)}
                      className={`px-3 py-1 rounded-md text-sm font-medium border transition-colors ${
                        selectedCinemas.includes(cinema)
                          ? `${getCinemaColors()[cinema]}`
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {cinema}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Date Filters */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Dates</h4>
                <div className="flex flex-wrap gap-2">
                  {dates.map(date => (
                    <button
                      key={date}
                      onClick={() => toggleDate(date)}
                      className={`px-3 py-1 rounded-md text-sm font-medium border transition-colors ${
                        selectedDates.includes(date)
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {new Date(date).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </button>
                  ))}
                </div>
              </div>

              {/* Variant Filters */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Variants {movie.variants ? `(${movie.variants.length})` : '(none)'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {movie.variants && movie.variants.length > 0 ? (
                    movie.variants.map(variant => (
                      <button
                        key={variant}
                        onClick={() => toggleVariant(variant)}
                        className={`px-3 py-1 rounded-md text-sm font-medium border transition-colors ${
                          selectedVariants.includes(variant)
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {variant}
                      </button>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">No variants available</span>
                  )}
                </div>
              </div>
              
              {/* Reset Button */}
              <div className="pt-2">
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reset All Filters
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Cinema Legend */}
        <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Cinemas:</h4>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const cinemaColors = getCinemaColors();
              const uniqueCinemas = new Set<string>();
              movie.cinemas.forEach(cinema => {
                uniqueCinemas.add(cinema.name);
              });
              
              return Array.from(uniqueCinemas).sort().map(cinemaName => (
                <button
                  key={cinemaName}
                  onClick={() => handleCinemaClick(cinemaName)}
                  className={`px-2 py-1 rounded-md text-xs font-medium border ${cinemaColors[cinemaName]} cursor-pointer hover:opacity-80 transition-opacity`}
                >
                  {cinemaName}
                </button>
              ));
            })()}
          </div>
        </div>
        

        
        {/* Showtimes Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="text-left p-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-200 min-w-[100px]">
                  Time
                </th>
                {(() => {
                  // Get all unique dates from all movies, but only show selected dates
                  const allDates = new Set<string>();
                  movie.cinemas.forEach(cinema => {
                    cinema.showtimes.forEach(showtime => {
                      allDates.add(showtime.date);
                    });
                  });
                  return Array.from(allDates).sort()
                    .filter(date => shouldShowDate(date)) // Only show selected dates
                    .map((date, dateIndex) => (
                      <th key={date} className="text-center p-3 font-medium text-gray-700 min-w-[150px] border-r border-gray-200">
                        {new Date(date).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </th>
                    ));
                })()}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Get all unique times for this movie across all dates
                const allTimes = new Set<string>();
                movie.cinemas.forEach(cinema => {
                  cinema.showtimes.forEach(showtime => {
                    showtime.times.forEach(time => {
                      allTimes.add(time);
                    });
                  });
                });
                const sortedTimes = Array.from(allTimes).sort();
                
                return sortedTimes
                  .filter(time => {
                    // Check if this time slot has any content after filtering
                    const allDates = new Set<string>();
                    movie.cinemas.forEach(cinema => {
                      cinema.showtimes.forEach(showtime => {
                        allDates.add(showtime.date);
                      });
                    });
                    const sortedDates = Array.from(allDates).sort();
                    
                    // Check if any date at this time has content
                    return sortedDates
                      .filter(date => shouldShowDate(date))
                      .some(date => {
                        const cinema = movie.cinemas.find(c => {
                          const showtime = c.showtimes.find(s => s.date === date);
                          return showtime && showtime.times.includes(time);
                        });
                        
                        if (!cinema) return false;
                        
                        const showtime = cinema.showtimes.find(s => s.date === date);
                        if (!showtime || !showtime.times.includes(time)) return false;
                        
                        // Check if there are any showings after filtering
                        const timeInfo = (showtime as any).timeInfo?.[time];
                        if (timeInfo && timeInfo.length > 0) {
                          return timeInfo.some(shouldShowShowing);
                        }
                        
                        // Fallback for non-merged movies
                        return shouldShowShowing({ 
                          language: movie.language.split('/')[0], 
                          cinema: cinema.name 
                        });
                      });
                  })
                  .map(time => (
                    <tr key={time} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                        {time}
                      </td>
                      {(() => {
                        // Get all unique dates from all movies
                        const allDates = new Set<string>();
                        movie.cinemas.forEach(cinema => {
                          cinema.showtimes.forEach(showtime => {
                            allDates.add(showtime.date);
                          });
                        });
                        const sortedDates = Array.from(allDates).sort();
                        
                        return sortedDates
                          .filter(date => shouldShowDate(date)) // Only show selected dates
                          .map((date, dateIndex) => {
                            // Find if this movie is playing at this time on this date
                            const cinema = movie.cinemas.find(c => {
                              const showtime = c.showtimes.find(s => s.date === date);
                              return showtime && showtime.times.includes(time);
                            });
                            
                            // Add border-r to all date columns except the last one
                            const isLastDate = dateIndex === sortedDates.filter(d => shouldShowDate(d)).length - 1;
                            
                            return (
                              <td key={date} className={`p-3 text-center text-sm ${!isLastDate ? 'border-r border-gray-200' : ''}`}>
                                {cinema ? (
                                  <div className="space-y-2">
                                    {/* All Showings for this Time/Date */}
                                    <div className="space-y-2">
                                      {(() => {
                                        // Find which showings are playing at this time/date
                                        const showtime = cinema.showtimes.find(s => s.date === date);
                                        if (showtime && showtime.times.includes(time)) {
                                          // Use the stored complete information from the merged movie
                                          const timeInfo = (showtime as any).timeInfo?.[time];
                                          
                                          if (timeInfo && timeInfo.length > 0) {
                                            // Filter showings based on selected cinemas and variants
                                            const filteredShowings = timeInfo.filter(shouldShowShowing);
                                            
                                            if (filteredShowings.length === 0) {
                                              return <span className="text-gray-300">-</span>;
                                            }
                                            
                                            // Debug logging for showings
                                            console.log('Filtered showings for time', time, ':', filteredShowings);
                                            
                                            // Always show all showings vertically stacked
                                            return (
                                              <div className="space-y-2">
                                                {filteredShowings.map((showing: any, idx: number) => (
                                                  <div key={idx} className="p-2 border border-gray-200 rounded bg-white">
                                                    <div className="flex items-center justify-center gap-2">
                                                      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getCinemaColors()[showing.cinema]}`}>
                                                        {showing.cinema}
                                                      </span>
                                                      {showing.variants && showing.variants.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                          {showing.variants.map((variant: string, vIdx: number) => (
                                                            <span key={vIdx} className="px-1 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 rounded">
                                                              {variant}
                                                            </span>
                                                          ))}
                                                        </div>
                                                      ) : (
                                                        <span className="text-xs text-gray-400">No variants</span>
                                                      )}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            );
                                          }
                                          
                                          // Fallback to original logic if timeInfo not available
                                          // Check if this showing should be displayed
                                          if (!shouldShowShowing({ language: movie.language.split('/')[0], cinema: cinema.name })) {
                                            return <span className="text-gray-300">-</span>;
                                          }
                                          
                                          return (
                                            <div className="flex items-center justify-center gap-2">
                                              <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getCinemaColors()[cinema.name]}`}>
                                                {cinema.name}
                                              </span>
                                              {movie.variants && movie.variants.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                  {movie.variants.map((variant: string, vIdx: number) => (
                                                    <span key={vIdx} className="px-1 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 rounded">
                                                      {variant}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        }
                                        return <span className="text-gray-300">-</span>;
                                      })()}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            );
                          });
                      })()}
                    </tr>
                  ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Cinema Popup */}
      {showCinemaPopup && selectedCinemaForPopup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handlePopupOutsideClick}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{selectedCinemaForPopup.name}</h3>
              <button
                onClick={() => {
                  setShowCinemaPopup(false);
                  setSelectedCinemaForPopup(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              {selectedCinemaForPopup.address && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 w-20">Address:</span>
                  <span className="text-gray-600">{selectedCinemaForPopup.address}</span>
                </div>
              )}
              
              {selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 w-20">Location:</span>
                  <span className="text-gray-600">{selectedCinemaForPopup.postalCode} {selectedCinemaForPopup.city}</span>
                </div>
              )}
              
              {selectedCinemaForPopup.url && (
                <div className="pt-2">
                  <a
                    href={selectedCinemaForPopup.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-cinema-600 text-white text-sm rounded-md hover:bg-cinema-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visit Website
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovieDetailPage;
