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
      
      // Backend now provides clean, processed data
      const cinemas = movie.cinemas.map(cinema => cinema.name).sort();
      const dates = movie.cinemas.flatMap(cinema => 
        cinema.showtimes.map(showtime => showtime.date)
      ).filter((date, index, arr) => arr.indexOf(date) === index).sort();
      const variants = movie.variants || [];
      
      return { cinemas, dates, variants };
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
      
      console.log('Movies API response in MovieDetailPage:', moviesResult);
      console.log('Total movies received:', moviesResult.movies.length);
      console.log('Looking for movie with title:', movieTitle);
      
      // Backend now provides merged movies, so just find by title
      const allMovies = moviesResult.movies;
      const foundMovie = allMovies.find(movie => 
        movie.title.toLowerCase() === movieTitle.toLowerCase()
      );
      
      if (foundMovie) {
        console.log('Found movie:', foundMovie);
        setMovie(foundMovie);
        setError(null);
      } else {
        console.log('Movie not found. Available titles:', allMovies.map(m => m.title));
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
    <div className="w-full px-2 sm:px-4 space-y-4">
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
        <div className="p-2 sm:p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row items-start space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Movie Poster */}
            <div className="flex-shrink-0 mx-auto sm:mx-0">
              <img
                src={movie.posterUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPg=='}
                alt={movie.title}
                className="w-20 h-30 object-cover rounded-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPg==';
                }}
              />
            </div>
            
            {/* Movie Info */}
            <div className="flex-1 min-w-0">
                              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 text-center sm:text-left">{movie.title}</h1>
              
              {/* Movie Details */}
                              <div className="mb-3 space-y-1 text-center sm:text-left">
                
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
                              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3 mb-3">
                {/* Variants Badge */}
                {movie.variants && movie.variants.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {movie.variants.map((variant, idx) => (
                      <span key={idx} className="px-3 py-1 text-sm font-medium bg-orange-100 text-orange-800 border border-orange-300 rounded-md">
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
              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
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
        <div className="px-2 sm:px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 space-y-2 sm:space-y-0">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cinema-500"
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
            
            <button
              onClick={resetFilters}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              <X className="h-4 w-4 mr-2" />
              Reset All Filters
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
                            ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-orange-50 hover:border-orange-300'
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
              

            </div>
          )}
        </div>
        

        {/* Showtimes Table - Using Backend Data */}
        <div className="overflow-x-auto relative">
          {movie.allShowtimes && movie.allShowtimes.length > 0 ? (
            <div className="space-y-4">
              {/* Group showtimes by date */}
              {(() => {
                const showtimesByDate = new Map<string, any[]>();
                
                // Filter showtimes based on selected dates and cinemas
                const filteredShowtimes = movie.allShowtimes.filter(showtime => {
                  const dateMatch = selectedDates.length === 0 || selectedDates.includes(showtime.date);
                  const cinemaMatch = selectedCinemas.length === 0 || selectedCinemas.includes(showtime.cinema);
                  const variantMatch = selectedVariants.length === 0 || 
                    (showtime.variants && showtime.variants.some(v => selectedVariants.includes(v)));
                  
                  return dateMatch && cinemaMatch && variantMatch;
                });
                
                // Group by date
                filteredShowtimes.forEach(showtime => {
                  if (!showtimesByDate.has(showtime.date)) {
                    showtimesByDate.set(showtime.date, []);
                  }
                  showtimesByDate.get(showtime.date)!.push(showtime);
                });
                
                // Sort dates
                const sortedDates = Array.from(showtimesByDate.keys()).sort();
                
                return sortedDates.map(date => {
                  const dateShowtimes = showtimesByDate.get(date)!;
                  const sortedDateShowtimes = dateShowtimes.sort((a, b) => a.time.localeCompare(b.time));
                  
                  return (
                    <div key={date} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <h3 className="font-medium text-gray-900">
                          {new Date(date).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h3>
                      </div>
                      <div className="p-4">
                        <div className="grid gap-3">
                          {sortedDateShowtimes.map((showtime, index) => (
                            <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                              <div className="flex items-center space-x-4">
                                <div className="text-lg font-mono text-gray-700 min-w-[60px]">
                                  {showtime.time}
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleCinemaClick(showtime.cinema)}
                                    className={`px-3 py-1 rounded-md text-sm font-medium ${getCinemaColors()[showtime.cinema]} cursor-pointer hover:opacity-80 transition-opacity`}
                                  >
                                    {showtime.cinema}
                                  </button>
                                  {showtime.variants && showtime.variants.length > 0 && (
                                    <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300 rounded-md">
                                      {showtime.variants.join(' ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-sm text-gray-500">
                                {showtime.address && (
                                  <span>{showtime.address}, {showtime.city}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No showtimes available for the selected filters.
            </div>
          )}
        </div>
      </div>
      
      {/* Cinema Popup */}
      {showCinemaPopup && selectedCinemaForPopup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handlePopupOutsideClick}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-2 sm:mx-4 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
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
              {(selectedCinemaForPopup.address || (selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city)) && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 w-20">Address: </span>
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(
                      `${selectedCinemaForPopup.name} ${selectedCinemaForPopup.address || ''} ${selectedCinemaForPopup.postalCode || ''} ${selectedCinemaForPopup.city || ''} Berlin`
                    ).trim()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-cinema-600 underline cursor-pointer transition-colors"
                  >
                    {selectedCinemaForPopup.address}
                    {selectedCinemaForPopup.address && selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city && ', '}
                    {selectedCinemaForPopup.postalCode && selectedCinemaForPopup.city && `${selectedCinemaForPopup.postalCode} ${selectedCinemaForPopup.city}`}
                  </a>
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
