import React from 'react';
import { Clock, MapPin, Star, Users, Calendar, Play, ExternalLink, X } from 'lucide-react';
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
    return movie.cinemas.reduce((total, cinema) => {
      return total + cinema.showtimes.reduce((cinemaTotal, showtime) => {
        return cinemaTotal + showtime.times.length;
      }, 0);
    }, 0);
  };

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
          <span className={`px-3 py-1 rounded-md text-sm font-medium ${
            movie.language === 'OV' 
              ? 'bg-blue-100 text-blue-800' 
              : 'bg-green-100 text-green-800'
          }`}>
            {movie.language}
          </span>
          
          {movie.fskRating > 0 && (
                    <span className="px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800">
          FSK {movie.fskRating}
        </span>
          )}
          
          <span className="text-sm text-gray-600">
            {movie.year} • {movie.country}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {movie.trailerUrl && (
            <a
              href={movie.trailerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-cinema-600 text-white rounded-lg hover:bg-cinema-700 transition-colors"
            >
              <Play className="h-4 w-4 mr-2" />
              Watch Trailer
            </a>
          )}
          
          {movie.reviewUrl && (
            <a
              href={movie.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Read Review
            </a>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Movie Poster */}
        <div className="text-center">
          <img
            src={movie.posterUrl}
            alt={movie.title}
            className="w-48 h-72 object-cover rounded-lg shadow-md mx-auto"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="288" viewBox="0 0 192 288"><rect width="192" height="288" fill="#f3f4f6"/><text x="96" y="144" font-family="Arial, sans-serif" font-size="14" fill="#6b7280" text-anchor="middle">🎬</text><text x="96" y="170" font-family="Arial, sans-serif" font-size="12" fill="#6b7280" text-anchor="middle">${movie.title}</text></svg>`;
              target.src = `data:image/svg+xml,${encodeURIComponent(fallbackSvg)}`;
            }}
          />
        </div>

        {/* Movie Details */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-gray-600">
            <Users className="h-4 w-4" />
            <span><strong>Director:</strong> {movie.director}</span>
          </div>
          
          {movie.cast.length > 0 && (
            <div className="flex items-start space-x-2 text-gray-600">
              <Star className="h-4 w-4 mt-0.5" />
              <div>
                <strong>Cast:</strong>
                <div className="mt-1 space-y-1">
                  {movie.cast.map((actor, index) => (
                    <div key={index} className="text-sm text-gray-700 ml-4">
                      • {actor}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
              <span><strong>{movie.cinemas.length} cinemas</strong></span>
            </div>
          </div>
        </div>

        {/* Cinemas and Showtimes Table */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Showtimes</h3>
          
          {/* Showtimes Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-700 bg-gray-50">Cinema</th>
                  {(() => {
                    // Get all unique dates from all cinemas
                    const allDates = new Set<string>();
                    movie.cinemas.forEach(cinema => {
                      cinema.showtimes.forEach(showtime => {
                        allDates.add(showtime.date);
                      });
                    });
                    return Array.from(allDates).sort().map(date => (
                      <th key={date} className="text-center p-3 font-medium text-gray-700 bg-gray-50 min-w-[120px]">
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
                {movie.cinemas.map((cinema) => (
                  <tr key={cinema.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <div>
                        <div className="font-medium text-gray-900">{cinema.name}</div>
                        <div className="text-sm text-gray-500">{cinema.address}</div>
                      </div>
                    </td>
                    {(() => {
                      // Get all unique dates from all cinemas
                      const allDates = new Set<string>();
                      movie.cinemas.forEach(c => {
                        c.showtimes.forEach(showtime => {
                          allDates.add(showtime.date);
                        });
                      });
                      const sortedDates = Array.from(allDates).sort();
                      
                      return sortedDates.map(date => {
                        const showtime = cinema.showtimes.find(s => s.date === date);
                        return (
                          <td key={date} className="p-3 text-center">
                            {showtime ? (
                              <div className="space-y-1">
                                {showtime.times.map((time, timeIndex) => (
                                  <span
                                    key={timeIndex}
                                    className="inline-block px-2 py-1 bg-cinema-100 text-cinema-800 text-xs rounded-md mb-1"
                                  >
                                    {time}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                        );
                      });
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieDetails;
