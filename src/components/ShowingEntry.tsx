import React from 'react';
import VariantBadge from './VariantBadge';
import { cn } from '../utils/cn';

interface Props {
  cinema: string;
  variant: string | null;
  colorClass: string;
  label: string;
  onCinemaClick: (name: string) => void;
}

const ShowingEntry: React.FC<Props> = ({ cinema, variant, colorClass, label, onCinemaClick }) => (
  <div className="flex min-w-0 items-center gap-1">
    <button
      onClick={() => onCinemaClick(cinema)}
      className={cn(
        'max-w-full truncate rounded-md px-1.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80',
        colorClass
      )}
      title={cinema}
    >
      {label}
    </button>
    {variant && <VariantBadge variant={variant} />}
  </div>
);

export default ShowingEntry;
