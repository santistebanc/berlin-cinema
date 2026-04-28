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
    title={variants.length > 0 ? `${cinema} · ${variants.join(' ')}` : cinema}
  >
    <span className="truncate leading-4">{label}</span>
    {variants.length > 0 && (
      <span className="flex shrink-0 items-center gap-0.5 opacity-70 leading-4">
        ·{variants.map(v => <span key={v} className="max-w-[6rem] truncate">{v}</span>)}
      </span>
    )}
  </button>
);

export default ShowingEntry;
