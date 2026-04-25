import React from 'react';
import { cn } from '../utils/cn';

interface SelectableChipProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
  inactiveClassName?: string;
  onClick: () => void;
}

const DEFAULT_INACTIVE_CLASS_NAME =
  'border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]';

const SelectableChip: React.FC<SelectableChipProps> = ({
  active,
  children,
  className = '',
  inactiveClassName = DEFAULT_INACTIVE_CLASS_NAME,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded border px-2 py-1.5 text-xs font-medium transition-colors',
        active ? className : inactiveClassName
      )}
    >
      {children}
    </button>
  );
};

export default SelectableChip;
