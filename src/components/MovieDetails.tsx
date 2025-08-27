import React from 'react';
import { Clock, MapPin, Star, Users, Calendar, X } from 'lucide-react';
import { Movie } from '../types';

interface MovieDetailsProps {
  movie: Movie | null;
  onClose: () => void;
}

const MovieDetails: React.FC<MovieDetailsProps> = ({ movie, onClose }) => {
  if (!movie) {
    return null;
  }

  const getTotalShowtimes = (movie: Movie) => {
    if (!movie.showings || typeof movie.showings !== 'object' || Array.isArray(movie.showings)) {
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

  // Get all unique cinemas from showings
  const getAllCinemas = () => {
    if (!movie.showings || typeof movie.showings !== 'object' || Array.isArray(movie.showings)) {
      return [];
    }
    
    const cinemas = new Set<string>();
    Object.values(movie.showings).forEach(dateShowings => {
      if (dateShowings && typeof dateShowings === 'object') {
        Object.values(dateShowings).forEach(timeShowings => {
          if (Array.isArray(timeShowings)) {
            timeShowings.forEach(showing => {
              if (showing.cinema) {
                cinemas.add(showing.cinema);
              }
            });
          }
        });
      }
    });
    return Array.from(cinemas).sort();
  };

  // Get all unique dates from showings
  const getAllDates = () => {
    if (!movie.showings || typeof movie.showings !== 'object' || Array.isArray(movie.showings)) {
      return [];
    }
    
    return Object.keys(movie.showings).sort();
  };

  const cinemas = getAllCinemas();
  const dates = getAllDates();

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 line-clamp-2">{movie.title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Close details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Quick Info Badges */}
        <div className="flex items-center space-x-3 mb-4">
          {movie.director && (
            <span className="px-3 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-800">
              Director: {movie.director}
            </span>
          )}
          
          {movie.year && (
            <span className="px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800">
              {movie.year}
            </span>
          )}
          
          {movie.country && (
            <span className="text-sm text-gray-600">
              {movie.country}
            </span>
          )}
        </div>

        {/* Cast */}
        {movie.cast && movie.cast.length > 0 && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Users className="h-4 w-4" />
            <span>Cast: {movie.cast.join(', ')}</span>
          </div>
        )}

        {/* Variants */}
        {movie.variants && movie.variants.length > 0 && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Star className="h-4 w-4" />
            <span>Variants: {movie.variants.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Movie Poster */}
        <div className="text-center">
          <img
            src={movie.posterUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjI4OCIgdmlld0JveD0iMCAwIDE5MiAyODgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMjg4IiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPg=='}
            alt={movie.title}
            className="w-48 h-72 object-cover rounded-lg shadow-md mx-auto"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjI4OCIgdmlld0JveD0iMCAwIDE5MiAyODgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMjg4IiBmaWxsPSIjZjNmNGY2Ii8+Cjwvc3ZnPg==';
            }}
          />
        </div>

        {/* Showtimes Summary */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between text-sm mb-3">
            <div className="flex items-center space-x-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span><strong>{getTotalShowtimes(movie)} showtimes</strong> available</span>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              <span><strong>{cinemas.length} cinemas</strong></span>
            </div>
          </div>
        </div>

        {/* Showtimes Table */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Showtimes</h3>
          
          {dates.length > 0 ? (
            <div className="space-y-4">
              {dates.map(date => (
                <div key={date} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h4 className="font-medium text-gray-900">
                      {new Date(date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </h4>
                  </div>
                  
                  <div className="p-4">
                    <div className="space-y-3">
                      {Object.entries(movie.showings[date]).map(([time, timeShowings]) => (
                        <div key={time} className="flex items-center space-x-4">
                          <div className="w-16 text-sm font-medium text-gray-700">
                            {time}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Array.isArray(timeShowings) && timeShowings.map((showing, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <span className="px-2 py-1 bg-cinema-100 text-cinema-800 text-xs rounded-md">
                                  {showing.cinema}
                                </span>
                                {showing.variant && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">
                                    {showing.variant}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No showtimes available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MovieDetails;
