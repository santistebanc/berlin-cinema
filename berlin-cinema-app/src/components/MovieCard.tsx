import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Star, Users, Calendar } from 'lucide-react';
import { Movie } from '../types';

interface MovieCardProps {
  movie: Movie;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getTotalShowtimes = () => {
    return movie.cinemas.reduce((total, cinema) => {
      return total + cinema.showtimes.reduce((cinemaTotal, showtime) => {
        return cinemaTotal + showtime.times.length;
      }, 0);
    }, 0);
  };

  const getCinemaCount = () => movie.cinemas.length;

  return (
    <div className="card hover:shadow-lg transition-shadow duration-200">
      {/* Movie Poster */}
      <div className="relative">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="w-full h-80 object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDMwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjMWYyOTM3Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMjAwIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPg==';
          }}
        />
        
        {/* Language Badge */}
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-1 rounded-md text-xs font-medium ${
            movie.language === 'OV' 
              ? 'bg-blue-500 text-white' 
              : 'bg-green-500 text-white'
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
        <Link to={`/movie/${movie.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-cinema-600 transition-colors line-clamp-2">
            {movie.title}
          </h3>
        </Link>
        
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
              <span>{getTotalShowtimes()} showtimes</span>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{getCinemaCount()} cinemas</span>
            </div>
          </div>
        </div>

        {/* Quick Cinema Preview */}
        {movie.cinemas.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-gray-500 mb-2">Playing at:</p>
            <div className="flex flex-wrap gap-1">
              {movie.cinemas.slice(0, 3).map((cinema) => (
                <span
                  key={cinema.id}
                  className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                >
                  {cinema.name}
                </span>
              ))}
              {movie.cinemas.length > 3 && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">
                  +{movie.cinemas.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieCard;
