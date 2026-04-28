import React from 'react';
import { cn } from '../utils/cn';

interface Props {
  cinema: string;
  variants: string[];
  colorClass: string;
  label: string;
  onCinemaClick: (name: string) => void;
}

const ShowingEntry: React.FC<Props> = ({ cinema, variants, colorClass, label, onCinemaClick }) => (
  <button
    onClick={() => onCinemaClick(cinema)}
    className={cn(
      'flex min-w-0 items-center gap-1 px-1 py-1 text-sm leading-4 font-medium transition-opacity hover:opacity-80',
      colorClass
    )}
    title={cinema}
  >
    <span className="truncate leading-4">{label}</span>
    {variants.length > 0 && <span className="shrink-0 opacity-70 leading-4">· {variants.join(' ')}</span>}
  </button>
);

export default ShowingEntry;
