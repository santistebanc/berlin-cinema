import React from 'react';
import { cn } from '../../utils/cn';

function titleToGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  const h1 = hash % 360;
  const h2 = (h1 + 40 + (hash >> 8) % 80) % 360;
  return `linear-gradient(160deg, hsl(${h1},40%,30%) 0%, hsl(${h2},45%,20%) 100%)`;
}

interface MoviePosterProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | null;
  title?: string;
}

const MoviePoster: React.FC<MoviePosterProps> = ({ alt, title, className, loading = 'lazy', src, ...props }) => {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    const label = title || alt || '';
    return (
      <div
        className={cn('aspect-[2/3] flex items-center justify-center overflow-hidden', className)}
        style={{ background: titleToGradient(label), containerType: 'inline-size' }}
        aria-label={label}
      >
        <span
          lang="de"
          className="px-[8cqi] text-center font-semibold leading-snug tracking-wide"
          style={{
            fontSize: '14cqi',
            color: 'rgba(255,255,255,0.8)',
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            hyphens: 'auto',
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      title={title}
      loading={loading}
      decoding="async"
      className={cn('object-cover', className)}
      onError={() => setFailed(true)}
      {...props}
    />
  );
};

export default MoviePoster;
