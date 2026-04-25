import React from 'react';
import { cn } from '../../utils/cn';

const FALLBACK_POSTER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDEyOCAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PC9zdmc+';

interface MoviePosterProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | null;
}

const MoviePoster: React.FC<MoviePosterProps> = ({ alt, className, loading = 'lazy', src, ...props }) => {
  return (
    <img
      src={src || FALLBACK_POSTER}
      alt={alt}
      loading={loading}
      decoding="async"
      className={cn('object-cover', !src && 'poster-fallback', className)}
      onError={(event) => {
        event.currentTarget.src = FALLBACK_POSTER;
      }}
      {...props}
    />
  );
};

export default MoviePoster;
