import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Play } from 'lucide-react';
import { Movie } from '../types';
import Badge from './ui/Badge';
import MoviePoster from './ui/MoviePoster';

interface Props {
  movie: Movie;
  plot?: string | null;
}

const MovieHeader: React.FC<Props> = ({ movie, plot }) => {
  const [plotOpen, setPlotOpen] = useState(false);

  return (
    <div className="ui-muted-surface p-3 sm:p-6">
      <div className="flex gap-4 sm:gap-5">
        <div className="flex-shrink-0">
          <MoviePoster src={movie.posterUrl} alt={movie.title} className="h-32 w-[85px] rounded-xl sm:h-40 sm:w-[107px]" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
          <div className="min-w-0 flex-1">
            <h1
              className="mb-1 text-left text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.25rem]"
              style={{ color: 'rgb(var(--text))' }}
            >
              {movie.tmdbTitle || movie.title}
            </h1>
            {movie.tagline && (
              <p className="mb-2 text-sm italic" style={{ color: 'rgb(var(--text-soft))' }}>
                {movie.tagline}
              </p>
            )}

            <div className="mb-3 space-y-1 text-left">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: 'rgb(var(--text-muted))' }}>
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime && <span>{movie.runtime} min</span>}
                {movie.rating != null && (
                  <span className="inline-flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    {movie.rating.toFixed(1)}
                    {movie.voteCount != null && (
                      <span style={{ color: 'rgb(var(--text-soft))' }}>
                        ({movie.voteCount >= 1000 ? `${(movie.voteCount / 1000).toFixed(0)}k` : movie.voteCount})
                      </span>
                    )}
                  </span>
                )}
                {movie.ageRating && <span>{movie.ageRating}</span>}
                {movie.originalLanguage && <span>{movie.originalLanguage.toUpperCase()}</span>}
                {movie.country && <span>{movie.country}</span>}
              </div>
              {movie.director && (
                <div className="body-muted">
                  <span className="font-medium" style={{ color: 'rgb(var(--text))' }}>Director:</span> {movie.director}
                </div>
              )}
              {movie.cast && movie.cast.length > 0 && (
                <div className="body-muted">
                  <span className="font-medium" style={{ color: 'rgb(var(--text))' }}>Cast:</span> {movie.cast.join(', ')}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {movie.genres?.map((genre) => (
                <Badge key={genre} tone="muted" className="px-2 py-1">{genre}</Badge>
              ))}
              {movie.variants && movie.variants.length > 0
                ? movie.variants.map((variant) => (
                    <Badge key={variant} tone="accent" className="px-1">{variant}</Badge>
                  ))
                : <Badge tone="muted" className="px-1">No variants</Badge>
              }
            </div>

            {(movie.trailerUrl || movie.imdbId) && (
              <div className="mt-3 flex items-center gap-3">
                {movie.trailerUrl && (
                  <a
                    href={movie.trailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                    style={{ color: 'rgb(var(--accent))' }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Trailer
                  </a>
                )}
                {movie.imdbId && (
                  <a
                    href={`https://www.imdb.com/title/${movie.imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                    style={{ color: 'rgb(var(--text-soft))' }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    IMDb
                  </a>
                )}
              </div>
            )}

            {plot && (
              <div className="mt-3 md:hidden">
                <button
                  onClick={() => setPlotOpen(o => !o)}
                  className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
                  style={{ color: 'rgb(var(--text-soft))' }}
                >
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-200"
                    style={{ transform: plotOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                  {plotOpen ? 'Hide plot' : 'Show plot'}
                </button>
                {plotOpen && (
                  <p className="body-muted mt-2 text-sm leading-relaxed">{plot}</p>
                )}
              </div>
            )}
          </div>

          {plot && (
            <div
              className="hidden border-t pt-3 md:block md:w-80 md:shrink-0 md:border-l md:border-t-0 md:pl-6 lg:w-96"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <p className="body-muted text-sm leading-relaxed">{plot}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MovieHeader;
