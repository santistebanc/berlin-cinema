import React from 'react';
import { cn } from '../utils/cn';

interface Props {
  cinema: string;
  variant: string | null;
  colorClass: string;
  label: string;
  onCinemaClick: (name: string) => void;
}

const ShowingEntry: React.FC<Props> = ({ cinema, variant, colorClass, label, onCinemaClick }) => (
  <div className="flex min-w-0 items-center">
    <button
      onClick={() => onCinemaClick(cinema)}
      className={cn(
        'flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80',
        colorClass
      )}
      title={cinema}
    >
      <span className="truncate">{label}</span>
      {variant && <span className="shrink-0" style={{ color: 'rgb(var(--accent-text))' }}>· {variant}</span>}
    </button>
  </div>
);

export default ShowingEntry;
