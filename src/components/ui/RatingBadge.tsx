import React, { useEffect, useRef, useState } from 'react';

interface Rating {
  source: string;
  value: string;
}

interface RatingBadgeProps {
  imdbRating: number | null;
  tmdbRating: number | null;
  imdbVotes: number | null;
  tmdbVotes: number | null;
  allRatings: Rating[] | null;
  className?: string;
}

const StarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500 shrink-0">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const RatingBadge: React.FC<RatingBadgeProps> = ({
  imdbRating, tmdbRating, imdbVotes, tmdbVotes, allRatings, className = '',
}) => {
  const displayRating = imdbRating ?? tmdbRating;
  const displayVotes = imdbVotes ?? tmdbVotes;
  const hasExtra = allRatings && allRatings.length > 1;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  if (displayRating == null) return null;

  const votesLabel = displayVotes != null
    ? displayVotes >= 1000
      ? `${(displayVotes / 1000).toFixed(0)}k`
      : String(displayVotes)
    : null;

  return (
    <span ref={ref} className={`relative inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => hasExtra && setOpen(v => !v)}
        className={`inline-flex items-center gap-1 ${hasExtra ? 'cursor-pointer' : 'cursor-default'}`}
        aria-expanded={hasExtra ? open : undefined}
        aria-haspopup={hasExtra ? 'true' : undefined}
      >
        <StarIcon />
        <span className="font-medium" style={{ color: 'rgb(var(--text-muted))' }}>
          {displayRating.toFixed(1)}
        </span>
        {votesLabel && (
          <span style={{ color: 'rgb(var(--text-soft))' }}>({votesLabel})</span>
        )}
        {imdbRating != null && (
          <span className="text-[10px] font-semibold" style={{ color: 'rgb(var(--text-soft))' }}>IMDb</span>
        )}
      </button>

      {hasExtra && open && (
        <span
          className="absolute bottom-full left-0 z-50 mb-2 w-44"
          style={{
            backgroundColor: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--border))',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <ul className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
            {allRatings.map(r => (
              <li key={r.source} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span style={{ color: 'rgb(var(--text-muted))' }}>{r.source}</span>
                <span className="font-medium tabular" style={{ color: 'rgb(var(--text))' }}>{r.value}</span>
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
};

export default RatingBadge;
