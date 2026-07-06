import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Movie } from '../../types';
import MoviePoster from '../ui/MoviePoster';
import { getCardTags } from '../../utils/movieTags';

interface HomeMovieCardProps {
  movie: Movie;
}

const HomeMovieCard: React.FC<HomeMovieCardProps> = ({ movie }) => {
  const rating = movie.imdbRating ?? movie.rating;
  const tags = getCardTags(movie.variants);

  const metaBits = [
    movie.originalLanguage?.toUpperCase(),
    movie.year ? String(movie.year) : null,
    movie.runtime ? `${movie.runtime} min` : null,
  ].filter(Boolean);

  return (
    <Link to={`/${movie.slug}`} className="group block">
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-xl"
        style={{ backgroundColor: 'rgb(var(--surface-muted))', boxShadow: '0 16px 34px -18px rgba(0,0,0,.85)' }}
      >
        <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.03]">
          <MoviePoster
            src={movie.posterUrl}
            alt={movie.title}
            title={movie.tmdbTitle || movie.altTitle || movie.title}
            loading="lazy"
            className="h-full w-full"
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(5,8,15,.5), transparent 26%)' }}
        />

        {tags.length > 0 && (
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md px-2 py-0.5 text-[11px] font-bold"
                style={{
                  backgroundColor: 'rgba(10,14,23,.72)',
                  color: 'rgb(var(--accent-text))',
                  border: '1px solid rgba(251,146,60,.4)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {rating != null && (
          <div
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: 'rgba(10,14,23,.72)',
              color: '#fbbf24',
              border: '1px solid rgba(255,255,255,.08)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <Star className="h-3 w-3" fill="currentColor" />
            {rating.toFixed(1)}
          </div>
        )}
      </div>

      <div className="pt-3">
        <h3
          className="serif truncate text-[19px] leading-tight transition-colors group-hover:text-[rgb(var(--accent))]"
          style={{ color: 'rgb(var(--text))' }}
        >
          {movie.originalTitle || movie.tmdbTitle || movie.altTitle || movie.title}
        </h3>
        {metaBits.length > 0 && (
          <p className="tabular mt-1 truncate text-xs" style={{ color: 'rgb(var(--text-soft))' }}>
            {metaBits.join('  ·  ')}
          </p>
        )}
      </div>
    </Link>
  );
};

export default HomeMovieCard;
