import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Play } from 'lucide-react';
import { Movie } from '../types';
import Badge from './ui/Badge';
import MoviePoster from './ui/MoviePoster';
import RatingBadge from './ui/RatingBadge';

const PlotSection: React.FC<{ plot: string }> = ({ plot }) => {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [plot]);

  return (
    <div>
      <p
        ref={ref}
        className={`body-muted text-sm leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}
      >
        {plot}
      </p>
      {(clamped || expanded) && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1 text-xs font-medium transition-colors"
          style={{ color: 'rgb(var(--accent))' }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};

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
                {movie.tmdbTitle || movie.altTitle || movie.title}
              </h1>
              {movie.criticTitle && (
                <p className="mb-1 text-sm" style={{ color: 'rgb(var(--text-soft))' }}>
                  {movie.criticTitle}
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
          {/* Director + cast: mobile only (moved to right column on desktop) */}
          {(movie.director || (movie.cast && movie.cast.length > 0) || plot) && (
            <div className="lg:hidden">
              <button
                onClick={() => setPlotOpen(o => !o)}
                className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
                style={{ color: 'rgb(var(--text-soft))' }}
              >
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-200"
                  style={{ transform: plotOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
                {plotOpen ? 'Hide details' : 'Show details'}
              </button>
              {plotOpen && (
                <div className="mt-2 space-y-2">

                  {plot && <PlotSection plot={plot} />}
                  {movie.allRatings && movie.allRatings.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {movie.allRatings.map(r => (
                        <span key={r.source}>
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>{r.source}</span>{' '}
                          <span className="font-medium" style={{ color: 'rgb(var(--text-muted))' }}>{r.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {movie.director && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>Director</span>
                      <span className="text-sm" style={{ color: 'rgb(var(--text-muted))' }}>{movie.director}</span>
                    </div>
                  )}
                  {movie.cast && movie.cast.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>Cast</span>
                      <span className="text-sm" style={{ color: 'rgb(var(--text-muted))' }}>{movie.cast.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: director, cast, plot — desktop only */}
        {(movie.director || (movie.cast && movie.cast.length > 0) || plot) && (
          <div
            className="hidden lg:flex lg:w-1/2 lg:shrink-0 lg:flex-col lg:gap-2 lg:border-l lg:pl-6 xl:w-[55%]"
            style={{ borderColor: 'rgb(var(--border))' }}
          >

            {plot && <PlotSection plot={plot} />}
            {movie.allRatings && movie.allRatings.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {movie.allRatings.map(r => (
                  <span key={r.source}>
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>{r.source}</span>{' '}
                    <span className="font-medium" style={{ color: 'rgb(var(--text-muted))' }}>{r.value}</span>
                  </span>
                ))}
              </div>
            )}
            {movie.director && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>Director</span>
                <span className="text-sm" style={{ color: 'rgb(var(--text-muted))' }}>{movie.director}</span>
              </div>
            )}
            {movie.cast && movie.cast.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-soft))' }}>Cast</span>
                <span className="text-sm" style={{ color: 'rgb(var(--text-muted))' }}>{movie.cast.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MovieHeader;
