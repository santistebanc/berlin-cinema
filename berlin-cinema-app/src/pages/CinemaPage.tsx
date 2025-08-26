import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Film, Clock, Calendar, Star, Users } from 'lucide-react';
import { movieApi, cinemaApi } from '../services/api';
import { Movie, CinemaInfo } from '../types';

const CinemaPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [cinema, setCinema] = useState<CinemaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadCinemaData(id);
    }
  }, [id]);

  const loadCinemaData = async (cinemaId: string) => {
    try {
      setLoading(true);
      const [moviesResult, cinemasResult] = await Promise.all([
        movieApi.getMoviesByCinema(cinemaId),
        cinemaApi.getAllCinemas()
      ]);
      
      setMovies(moviesResult.movies);
      const foundCinema = cinemasResult.cinemas.find(c => c.id === cinemaId);
      setCinema(foundCinema || null);
      setError(null);
    } catch (err) {
      setError('Failed to load cinema information');
      console.error('Error loading cinema data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cinema-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading cinema information...</p>
        </div>
      </div>
    );
  }

  if (error || !cinema) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Cinema Not Found</h2>
        <p className="text-gray-600 mb-6">{error || 'The requested cinema could not be found.'}</p>
        <Link to="/" className="px-4 py-2 bg-cinema-600 text-white rounded-lg hover:bg-cinema-700 transition-colors">
          ← Back to Movies
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back Button */}
      <Link 
        to="/" 
        className="inline-flex items-center text-cinema-600 hover:text-cinema-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Movies
      </Link>

      {/* Cinema Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{cinema.name}</h1>
          <div className="flex items-center justify-center space-x-2 text-gray-600 mb-6">
            <MapPin className="h-5 w-5" />
            <span className="text-lg">{cinema.district}, Berlin</span>
          </div>
          
          <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <Film className="h-4 w-4" />
              <span>{movies.length} movies playing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Movies List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Movies Playing at {cinema.name}</h2>
        </div>
        
        {movies.length === 0 ? (
          <div className="text-center py-12">
            <Film className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No movies currently playing at this cinema.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {movies.map((movie) => (
              <Link
                key={movie.id}
                to={`/movie/${encodeURIComponent(movie.title)}`}
                className="block group"
              >
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-200">
                  {/* Movie Poster */}
                  <div className="relative">
                    <img
                      src={movie.posterUrl}
                      alt={movie.title}
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTkyIiBmaWxsPSIjMWYyOTM3Ii8+Cjx0ZXh0IHg9IjY0IiB5PSI5NiIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4=';
                      }}
                    />
                    
                    {/* Language Badge */}
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        movie.language === 'OV' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-green-600 text-white'
                      }`}>
                        {movie.language}
                      </span>
                    </div>
                    
                    {/* FSK Rating */}
                    {movie.fskRating > 0 && (
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-gray-800 text-white">
                          FSK {movie.fskRating}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Movie Info */}
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                      {movie.title}
                    </h3>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>{movie.year}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Star className="h-4 w-4" />
                        <span>{movie.country}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4" />
                        <span className="line-clamp-1">{movie.director}</span>
                      </div>
                    </div>

                    {/* Showtimes Summary */}
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Clock className="h-4 w-4" />
                          <span>{movie.cinemas.reduce((total, cinema) => {
                            return total + cinema.showtimes.reduce((cinemaTotal, showtime) => {
                              return cinemaTotal + showtime.times.length;
                            }, 0);
                          }, 0)} showtimes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Cinema Information */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">About {cinema.name}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Location</h4>
            <p className="text-gray-600">{cinema.district}, Berlin</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Current Program</h4>
            <p className="text-gray-600">{movies.length} OV movies</p>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            This cinema shows original language (OV) and original language with German subtitles (OmU) movies.
            Click on any movie to see detailed showtimes and ticket information.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CinemaPage;
