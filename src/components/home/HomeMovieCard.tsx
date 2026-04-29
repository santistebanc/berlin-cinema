import React from 'react';
import { Link } from 'react-router-dom';
import { Movie } from '../../types';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import MoviePoster from '../ui/MoviePoster';
import RatingBadge from '../ui/RatingBadge';

function formatLanguage(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    de: 'German',
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    pt: 'Portuguese',
    ru: 'Russian',
    ar: 'Arabic',
    hi: 'Hindi',
    tr: 'Turkish',
    pl: 'Polish',
    nl: 'Dutch',
    sv: 'Swedish',
    da: 'Danish',
    no: 'Norwegian',
    fi: 'Finnish',
  };
  return map[code.toLowerCase()] ?? code.toUpperCase();
}

interface HomeMovieCardProps {
  movie: Movie;
}

const HomeMovieCard: React.FC<HomeMovieCardProps> = ({ movie }) => {
  return (
    <Link
      to={`/${movie.slug}`}
      className="block h-full"
    >
      <Card className="flex h-full flex-col overflow-hidden border-2 hover:border-[rgb(var(--accent)/0.35)] hover:shadow-lg">
        <MoviePoster
          src={movie.posterUrl}
          alt={movie.title}
          title={movie.tmdbTitle || movie.altTitle || movie.title}
          loading='lazy'
          className='aspect-[2/3] w-full'
        />

        <article className='flex flex-1 flex-col p-2 sm:p-4'>
          <h3
            className='mb-1 line-clamp-2 text-base font-semibold leading-snug tracking-[-0.01em]'
            style={{ color: 'rgb(var(--text))' }}
          >
            {movie.tmdbTitle || movie.altTitle || movie.title}
          </h3>

          {movie.criticTitle && (
            <p className="mb-2 truncate text-xs" style={{ color: 'rgb(var(--text-muted))' }}>
              {movie.criticTitle}
            </p>
          )}

          {((movie.imdbRating ?? movie.rating) != null || movie.year || movie.runtime || movie.originalLanguage) && (
            <div className="mb-2 flex items-center gap-1.5 text-xs tabular" style={{ color: 'rgb(var(--text-soft))' }}>
              <RatingBadge
                imdbRating={movie.imdbRating ?? null}
                tmdbRating={movie.rating}
                imdbVotes={null}
                tmdbVotes={null}
                allRatings={null}
              />
              {((movie.imdbRating ?? movie.rating) != null || movie.originalLanguage) && (movie.year || movie.runtime) && <span>·</span>}
              {movie.year && <span>{movie.year}</span>}
              {movie.year && movie.runtime && <span>·</span>}
              {movie.runtime && <span>{movie.runtime} min</span>}
              {(movie.year || movie.runtime) && movie.originalLanguage && <span>·</span>}
              {movie.originalLanguage && <span>{formatLanguage(movie.originalLanguage)}</span>}
            </div>
          )}

          {movie.variants.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {movie.variants.map((variant) => (
                <Badge key={variant} tone="accent" className="px-1">
                  {variant}
                </Badge>
              ))}
            </div>
          )}

        </article>
      </Card>
    </Link>
  );
};

export default HomeMovieCard;
