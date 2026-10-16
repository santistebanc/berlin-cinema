import React from 'react';
import { cn } from '../utils/cn';

interface Props {
  cinema: string;
  variants: string[];
  colorClass: string;
  label: string;
  onCinemaClick: (name: string) => void;
  uncertain?: boolean;
  stale?: boolean;
  edition?: string | null;
}

const ShowingEntry: React.FC<Props> = ({ cinema, variants, colorClass, label, onCinemaClick, uncertain, stale, edition }) => (
  <button
    onClick={() => onCinemaClick(cinema)}
    className={cn(
      'flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium leading-4 transition-opacity hover:opacity-80 sm:max-w-[240px]',
      colorClass
    )}
    title={[cinema, ...variants, edition, uncertain && 'Source descriptions disagree; verify with the cinema', stale && 'Source refresh unavailable; last observed within 24 hours'].filter(Boolean).join(' · ')}
  >
    <span className="min-w-0 whitespace-normal text-left [overflow-wrap:anywhere]">{label}</span>
    {(uncertain || stale || edition || variants.length > 0) && (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-right">
        {(uncertain || stale) && <span className="text-[10px] font-medium">{uncertain ? 'Check version' : 'Last known'}</span>}
        {edition && <span className="text-[10px] opacity-70">{edition}</span>}
        {variants.length > 0 && (
          <span className="whitespace-nowrap text-[11px] font-semibold opacity-70">
            {variants.join(' ')}
          </span>
        )}
      </span>
    )}
  </button>
);

export default ShowingEntry;
