import React from 'react';

interface RatingBadgeProps {
  imdbRating: number | null;
  tmdbRating: number | null;
  imdbVotes: number | null;
  tmdbVotes: number | null;
  allRatings: unknown;
  className?: string;
}

const StarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500 shrink-0">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const RatingBadge: React.FC<RatingBadgeProps> = ({
  imdbRating, tmdbRating, imdbVotes, tmdbVotes, className = '',
}) => {
  const displayRating = imdbRating ?? tmdbRating;
  const displayVotes = imdbVotes ?? tmdbVotes;

  if (displayRating == null) return null;

  const votesLabel = displayVotes != null
    ? displayVotes >= 1000
      ? `${(displayVotes / 1000).toFixed(0)}k`
      : String(displayVotes)
    : null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <StarIcon />
      <span className="font-medium" style={{ color: 'rgb(var(--text-muted))' }}>{displayRating.toFixed(1)}</span>
      {votesLabel && <span style={{ color: 'rgb(var(--text-soft))' }}>({votesLabel})</span>}
      {imdbRating != null && <span className="text-[10px] font-semibold" style={{ color: 'rgb(var(--text-soft))' }}>IMDb</span>}
    </span>
  );
};

export default RatingBadge;
