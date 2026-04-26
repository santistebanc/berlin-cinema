import React from 'react';
import { Link } from 'react-router-dom';
import { Movie } from '../../types';
import { getMovieShowtimeCount } from '../../hooks/useHomePageMovies';
import { toSlug } from '../../utils/cinemaUtils';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import MoviePoster from '../ui/MoviePoster';
import RatingBadge from '../ui/RatingBadge';

interface HomeMovieCardProps {
  movie: Movie;
}

const HomeMovieCard: React.FC<HomeMovieCardProps> = ({ movie }) => {
  const showtimeCount = getMovieShowtimeCount(movie);

  return (
    <Link
      to={`/movie/${toSlug(movie.title)}`}
      className="block h-full"
    >
      <Card className="flex h-full flex-col overflow-hidden border-2 hover:border-[rgb(var(--accent)/0.35)] hover:shadow-lg">
        <MoviePoster
          src={movie.posterUrl}
          alt={movie.title}
          loading='lazy'
          className='aspect-[2/3] w-full'
        />

        <article className='flex flex-1 flex-col p-2 sm:p-4'>
          <h3
            className='mb-1 line-clamp-2 text-base font-semibold leading-snug tracking-[-0.01em]'
            style={{ color: 'rgb(var(--text))' }}
          >
            {movie.tmdbTitle || movie.title}
          </h3>

          {movie.director && (
            <p className="mb-2 truncate text-xs" style={{ color: 'rgb(var(--text-muted))' }}>
              {movie.director}
            </p>
          )}

          {((movie.imdbRating ?? movie.rating) != null || movie.year || movie.runtime) && (
            <div className="mb-2 flex items-center gap-1.5 text-xs tabular" style={{ color: 'rgb(var(--text-soft))' }}>
              <RatingBadge
                imdbRating={movie.imdbRating ?? null}
                tmdbRating={movie.rating}
                imdbVotes={movie.imdbVotes ?? null}
                tmdbVotes={movie.voteCount}
                allRatings={movie.allRatings ?? null}
              />
              {(movie.imdbRating ?? movie.rating) != null && (movie.year || movie.runtime) && <span>·</span>}
              {movie.year && <span>{movie.year}</span>}
              {movie.year && movie.runtime && <span>·</span>}
              {movie.runtime && <span>{movie.runtime} min</span>}
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

          <footer className="mt-auto pt-1">
            <span className="text-xs" style={{ color: 'rgb(var(--text-soft))' }}>
              {showtimeCount} showtime{showtimeCount !== 1 ? 's' : ''}
            </span>
          </footer>
        </article>
      </Card>
    </Link>
  );
};

export default HomeMovieCard;
