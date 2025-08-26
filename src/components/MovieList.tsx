import React from 'react';

import { Clock, MapPin, Star, Users, Calendar, Play, ExternalLink } from 'lucide-react';
import { Movie } from '../types';

interface MovieListProps {
  movies: Movie[];
  onMovieSelect: (movie: Movie) => void;
}

const MovieList: React.FC<MovieListProps> = ({ movies, onMovieSelect }) => {

  return (
    <div className="space-y-2">
      {movies.map((movie) => (
        <div key={movie.id} className="bg-white rounded-lg border border-gray-200 hover:border-cinema-300 transition-colors">
          <div className="flex items-center justify-between p-3">
            {/* Left side - Movie title and language badge */}
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <button
                onClick={() => onMovieSelect(movie)}
                className="text-left flex-1 min-w-0"
              >
                <h3 className="text-base font-medium text-gray-900 hover:text-cinema-600 transition-colors truncate">
                  {movie.title}
                </h3>
              </button>
              
              <span className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${
                movie.language === 'OV' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {movie.language}
              </span>
            </div>

            {/* Right side - Action buttons and cinema tags */}
            <div className="flex items-center space-x-3 ml-4">
              {/* Action Buttons */}
              {movie.trailerUrl && (
                <a
                  href={movie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-cinema-600 hover:text-cinema-700 hover:bg-cinema-50 rounded-md transition-colors"
                  title="Watch Trailer"
                >
                  <Play className="h-4 w-4" />
                </a>
              )}
              
              {movie.reviewUrl && (
                <a
                  href={movie.reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                  title="Read Review"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              {/* Cinema Tags */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Playing at:</span>
                <div className="flex flex-wrap gap-1">
                  {movie.cinemas.slice(0, 2).map((cinema) => (
                    <span
                      key={cinema.id}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                    >
                      {cinema.name}
                    </span>
                  ))}
                  {movie.cinemas.length > 2 && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">
                  +{movie.cinemas.length - 2} more
                </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MovieList;
