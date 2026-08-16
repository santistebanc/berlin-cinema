import React from 'react';
import { ArrowLeft, Check, ExternalLink, Play, Share2 } from 'lucide-react';
import { Movie } from '../types';
import MoviePoster from './ui/MoviePoster';

interface Props {
  movie: Movie;
  plot?: string | null;
  onBack: () => void;
  onShare: () => void;
  shared: boolean;
}

const MovieHeader: React.FC<Props> = ({ movie, plot, onBack, onShare, shared }) => {
  const displayTitle = movie.originalTitle || movie.tmdbTitle || movie.altTitle || movie.title;
  const rating = movie.imdbRating ?? movie.rating;
  const votes = movie.imdbVotes ?? movie.voteCount;
  const subBits = [movie.director, movie.country].filter(Boolean);

  return (
    <div>
      {/* Hero */}
      <div className="relative">
        {movie.backdropUrl && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={movie.backdropUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: 'center 30%' }} />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgb(var(--surface)) 6%, rgb(var(--surface) / .6) 46%, rgb(var(--surface) / .35))' }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to right, rgb(var(--surface) / .8), rgb(var(--surface) / .15) 70%)' }}
            />
          </div>
        )}

        <div className="relative p-4 pb-6 sm:p-6 lg:p-9">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
              style={{ color: 'rgb(var(--accent-text))' }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to films
            </button>
            <button
              onClick={onShare}
              aria-label={shared ? 'Link copied' : 'Share this movie'}
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:opacity-80"
              style={{ backgroundColor: 'rgb(var(--surface) / .55)', borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-muted))' }}
            >
              {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            </button>
          </div>

          <div className="mt-6 flex gap-4 sm:mt-10 sm:gap-7">
            <MoviePoster
              src={movie.posterUrl}
              alt={movie.title}
              title={movie.tmdbTitle || movie.altTitle || movie.title}
              className="h-[150px] w-[100px] shrink-0 rounded-xl object-cover shadow-2xl sm:h-[258px] sm:w-[172px]"
              style={{ border: '1px solid rgba(255,255,255,.08)' }}
            />
            <div className="min-w-0 flex-1 pb-1">
              <h1
                className="serif text-[1.7rem] leading-[1.05] sm:text-[3rem]"
                style={{ color: 'rgb(var(--text))', textShadow: '0 2px 24px rgba(0,0,0,.5)' }}
              >
                {displayTitle}
              </h1>
              {subBits.length > 0 && (
                <div className="mt-1.5 text-sm" style={{ color: 'rgb(var(--text-soft))' }}>
                  {subBits.join(' · ')}
                </div>
              )}

              <div className="tabular mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: 'rgb(var(--text-muted))' }}>
                {movie.originalLanguage && (
                  <span
                    className="rounded px-2 py-0.5 text-xs font-bold tracking-wide"
                    style={{ backgroundColor: 'rgb(var(--accent) / .16)', color: 'rgb(var(--accent-text))' }}
                  >
                    {movie.originalLanguage.toUpperCase()}
                  </span>
                )}
                {movie.year && <span>{movie.year}</span>}
                {movie.runtime && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>{movie.runtime} min</span>
                  </>
                )}
                {rating != null && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: '#fbbf24' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/></svg>
                      {rating.toFixed(1)}
                      {votes != null && (
                        <span className="text-xs font-medium" style={{ color: 'rgb(var(--text-soft))' }}>
                          · {votes >= 1000 ? `${(votes / 1000).toFixed(0)}k` : votes}
                        </span>
                      )}
                    </span>
                  </>
                )}
                {movie.ageRating && (
                  <span className="rounded border px-1.5 text-xs font-semibold" style={{ borderColor: 'rgb(var(--border-strong))' }}>
                    FSK {movie.ageRating}
                  </span>
                )}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {movie.genres?.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-md px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'rgb(var(--surface-muted) / .7)', border: '1px solid rgb(var(--border-strong))', color: 'rgb(var(--text-muted))' }}
                  >
                    {genre}
                  </span>
                ))}
                {movie.variants.map((variant) => (
                  <span
                    key={variant}
                    className="rounded-md px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: 'rgb(var(--accent-soft))', border: '1px solid rgb(var(--accent) / .4)', color: 'rgb(var(--accent-text))' }}
                  >
                    {variant}
                  </span>
                ))}
              </div>

              {(movie.trailerUrl || movie.imdbId) && (
                <div className="mt-4 flex items-center gap-5">
                  {movie.trailerUrl && (
                    <a
                      href={movie.trailerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
                      style={{ color: 'rgb(var(--accent))' }}
                    >
                      <Play className="h-4 w-4" fill="currentColor" />
                      Watch trailer
                    </a>
                  )}
                  {movie.imdbId && (
                    <a
                      href={`https://www.imdb.com/title/${movie.imdbId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
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
        </div>
      </div>

      {/* Synopsis band — the details under the title */}
      {(plot || movie.director || (movie.cast && movie.cast.length > 0)) && (
        <div className="flex flex-col gap-6 border-t p-4 sm:flex-row sm:gap-10 sm:p-6 lg:p-9" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="min-w-0 flex-[1.4]">
            {movie.tagline && (
              <div className="serif mb-2.5 text-lg italic" style={{ color: 'rgb(var(--accent-text))' }}>
                &ldquo;{movie.tagline}&rdquo;
              </div>
            )}
            {plot && (
              <p className="text-[15px] leading-relaxed" style={{ color: 'rgb(var(--text-muted))' }}>
                {plot}
              </p>
            )}
            {movie.allRatings && movie.allRatings.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-6">
                {movie.allRatings.map((r) => (
                  <div key={r.source}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--text-soft))' }}>
                      {r.source}
                    </div>
                    <div className="mt-0.5 text-base font-bold" style={{ color: 'rgb(var(--text))' }}>
                      {r.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0" style={{ borderColor: 'rgb(var(--border))' }}>
            {movie.director && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--text-soft))' }}>
                  Director
                </div>
                <div className="mt-0.5 text-[15px]" style={{ color: 'rgb(var(--text)) ' }}>
                  {movie.director}
                </div>
              </>
            )}
            {movie.cast && movie.cast.length > 0 && (
              <>
                <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--text-soft))' }}>
                  Cast
                </div>
                <div className="mt-0.5 text-[15px] leading-relaxed" style={{ color: 'rgb(var(--text-muted))' }}>
                  {movie.cast.join(', ')}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MovieHeader;
