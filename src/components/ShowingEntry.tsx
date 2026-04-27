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
      'flex min-w-0 items-center gap-1 px-1 py-1 text-sm leading-4 font-medium transition-opacity hover:opacity-80',
      colorClass
    )}
    title={cinema}
  >
    <span className="truncate leading-4">{label}</span>
    {variant && <span className="shrink-0 opacity-70 leading-4">· {variant}</span>}
  </button>
);

export default ShowingEntry;
