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
      'flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium leading-4 transition-opacity hover:opacity-80 sm:max-w-[240px]',
      colorClass
    )}
    title={variants.length > 0 ? `${cinema} · ${variants.join(' ')}` : cinema}
  >
    <span className="min-w-0 truncate">{label}</span>
    {variants.length > 0 && (
      <span className="shrink-0 truncate text-[11px] font-semibold opacity-70">
        {variants.join(' ')}
      </span>
    )}
  </button>
);

export default ShowingEntry;
