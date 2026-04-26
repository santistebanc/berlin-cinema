import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Play } from 'lucide-react';
import { Movie } from '../types';
import Badge from './ui/Badge';
import MoviePoster from './ui/MoviePoster';
import RatingBadge from './ui/RatingBadge';

interface Props {
  movie: Movie;
  plot?: string | null;
}

const MovieHeader: React.FC<Props> = ({ movie, plot }) => {
  const [plotOpen, setPlotOpen] = useState(false);

  return (
    <div className="ui-muted-surface p-3 sm:p-6">
      <div className="flex gap-6">
        {/* Left: poster + all metadata */}
        <div className="min-w-0 flex-1">
          {/* Poster + title row */}
          <div className="mb-3 flex gap-3 sm:gap-5">
            <div className="flex-shrink-0">
              <MoviePoster src={movie.posterUrl} alt={movie.title} className="h-28 w-[75px] sm:h-40 sm:w-[107px]" />
            </div>
            <div className="min-w-0 flex-1">
              <h1
                className="mb-1 text-left text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.25rem]"
                style={{ color: 'rgb(var(--text))' }}
              >
                {movie.tmdbTitle || movie.title}
              </h1>
              {movie.tagline && (
                <p className="mb-1 text-sm italic" style={{ color: 'rgb(var(--text-soft))' }}>
                  {movie.tagline}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm" style={{ color: 'rgb(var(--text-muted))' }}>
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime && <span>{movie.runtime} min</span>}
                <RatingBadge
                  imdbRating={movie.imdbRating ?? null}
                  tmdbRating={movie.rating}
                  imdbVotes={movie.imdbVotes ?? null}
                  tmdbVotes={movie.voteCount}
                  allRatings={movie.allRatings ?? null}
                />
                {movie.ageRating && <span>{movie.ageRating}</span>}
                {movie.originalLanguage && <span>{movie.originalLanguage.toUpperCase()}</span>}
                {movie.country && <span>{movie.country}</span>}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                <div className="mt-2 flex items-center gap-3">
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
            </div>
          </div>
          {/* Full-width metadata */}
          <div className="space-y-2">
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

            {plot && (
              <div className="md:hidden">
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
        </div>

        {/* Right: plot column — desktop only, starts at top */}
        {plot && (
          <div
            className="hidden md:block md:w-72 md:shrink-0 md:border-l md:pl-6 lg:w-80"
            style={{ borderColor: 'rgb(var(--border))' }}
          >
            <p className="body-muted text-sm leading-relaxed">{plot}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieHeader;
