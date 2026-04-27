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
  <button
    onClick={() => onCinemaClick(cinema)}
    className={cn(
      'flex min-h-9 min-w-0 items-center gap-1 px-1 text-sm font-medium transition-opacity hover:opacity-80',
      colorClass
    )}
    title={cinema}
  >
    <span className="truncate">{label}</span>
    {variant && <span className="shrink-0 opacity-70">· {variant}</span>}
  </button>
);

export default ShowingEntry;
