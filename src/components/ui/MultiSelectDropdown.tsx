import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
}

const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={cn(
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
      checked
        ? 'border-[rgb(var(--accent-strong))] bg-[rgb(var(--accent-strong))]'
        : 'border-[rgb(var(--border-strong))]'
    )}
  >
    {checked && <Check className="h-2.5 w-2.5 text-white" />}
  </span>
);

const OptionList: React.FC<{
  options: Option[];
  selected: string[];
  allSelected: boolean;
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  mobile?: boolean;
}> = ({ options, selected, allSelected, onToggle, onSelectAll, mobile }) => (
  <>
    <button
      type="button"
      onClick={onSelectAll}
      className={cn(
        'flex w-full items-center gap-2.5 border-b text-left font-medium transition-colors hover:bg-[rgb(var(--surface-muted))]',
        mobile ? 'px-5 py-3.5 text-sm' : 'px-3 py-2 text-xs'
      )}
      style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-muted))' }}
    >
      <Checkbox checked={allSelected} />
      All
    </button>
    <div className={cn('overflow-y-auto', mobile ? 'max-h-[60vh]' : 'max-h-56')}>
      {options.map(opt => {
        const checked = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={cn(
              'flex w-full items-center gap-2.5 text-left transition-colors hover:bg-[rgb(var(--surface-muted))]',
              mobile ? 'px-5 py-3.5 text-sm' : 'px-3 py-2 text-xs'
            )}
            style={{ color: 'rgb(var(--text))' }}
          >
            <Checkbox checked={checked} />
            {opt.label}
          </button>
        );
      })}
    </div>
  </>
);

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
  allSelected,
}) => {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  const activeCount = allSelected ? 0 : selected.length;

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded border px-3 text-xs font-medium transition-colors',
        !allSelected
          ? 'border-[rgb(var(--accent-strong))] bg-[rgb(var(--accent-strong))] text-white'
          : 'border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]'
      )}
    >
      {label}
      {!allSelected && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-semibold text-white">
          {activeCount}
        </span>
      )}
      <ChevronDown className={cn('h-3 w-3 transition-transform', open && !isMobile && 'rotate-180')} />
    </button>
  );

  const dropdown = open && !isMobile && (
    <div
      className="absolute left-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded border shadow-lg"
      style={{
        backgroundColor: 'rgb(var(--surface))',
        borderColor: 'rgb(var(--border-strong))',
      }}
    >
      <OptionList
        options={options}
        selected={selected}
        allSelected={allSelected}
        onToggle={onToggle}
        onSelectAll={onSelectAll}
      />
    </div>
  );

  const bottomSheet = open && isMobile && createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
        style={{ backgroundColor: 'rgb(var(--surface))' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'rgb(var(--border))' }}>
          <span className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>{label}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 transition-colors hover:bg-[rgb(var(--surface-muted))]"
            style={{ color: 'rgb(var(--text-muted))' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <OptionList
          options={options}
          selected={selected}
          allSelected={allSelected}
          onToggle={onToggle}
          onSelectAll={onSelectAll}
          mobile
        />
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </div>
    </>,
    document.body
  );

  return (
    <div ref={ref} className="relative">
      {trigger}
      {dropdown}
      {bottomSheet}
    </div>
  );
};

export default MultiSelectDropdown;
