import React from 'react';
import { Columns, LayoutGrid, X } from 'lucide-react';
import { cn } from '../utils/cn';
import MultiSelectDropdown from './ui/MultiSelectDropdown';

interface ShowtimesToolbarProps {
  tableMode: 'grid' | 'stacked';
  setTableMode: (mode: 'grid' | 'stacked') => void;
  availableCinemas: string[];
  availableDates: string[];
  availableVariants: string[];
  selectedCinemas: string[];
  selectedDates: string[];
  selectedVariants: string[];
  toggleCinema: (v: string) => void;
  toggleDate: (v: string) => void;
  toggleVariant: (v: string) => void;
  toggleAllCinemas: () => void;
  toggleAllDates: () => void;
  toggleAllVariants: () => void;
  resetFilters: () => void;
}

const ShowtimesToolbar: React.FC<ShowtimesToolbarProps> = ({
  tableMode,
  setTableMode,
  availableCinemas,
  availableDates,
  availableVariants,
  selectedCinemas,
  selectedDates,
  selectedVariants,
  toggleCinema,
  toggleDate,
  toggleVariant,
  toggleAllCinemas,
  toggleAllDates,
  toggleAllVariants,
  resetFilters,
}) => {
  const allCinemasSelected =
    selectedCinemas.length === availableCinemas.length &&
    availableCinemas.every(c => selectedCinemas.includes(c));
  const allDatesSelected =
    selectedDates.length === availableDates.length &&
    availableDates.every(d => selectedDates.includes(d));
  const allVariantsSelected =
    selectedVariants.length === availableVariants.length &&
    availableVariants.every(v => selectedVariants.includes(v));

  const hasFilters = !allCinemasSelected || !allDatesSelected || !allVariantsSelected;

  const cinemaOptions = availableCinemas.map(c => ({ value: c, label: c }));
  const dateOptions = availableDates.map(d => ({
    value: d,
    label: new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  }));
  const variantOptions = availableVariants.map(v => ({ value: v, label: v }));

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3">
      <div
        role="group"
        aria-label="View mode"
        className="inline-flex shrink-0 overflow-hidden border"
        style={{ borderColor: 'rgb(var(--border-strong))' }}
      >
        <button
          type="button"
          onClick={() => setTableMode('stacked')}
          aria-pressed={tableMode === 'stacked'}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center transition-colors',
            tableMode === 'stacked'
              ? 'bg-[rgb(var(--accent-strong))] text-white'
              : 'bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]'
          )}
          title="Stacked view"
        >
          <Columns className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTableMode('grid')}
          aria-pressed={tableMode === 'grid'}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center border-l transition-colors',
            'border-[rgb(var(--border-strong))]',
            tableMode === 'grid'
              ? 'bg-[rgb(var(--accent-strong))] text-white'
              : 'bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))]'
          )}
          title="Grid view"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
      </div>

      <MultiSelectDropdown
        label="Cinemas"
        options={cinemaOptions}
        selected={selectedCinemas}
        onToggle={toggleCinema}
        onToggleAll={toggleAllCinemas}
        allSelected={allCinemasSelected}
      />

      <MultiSelectDropdown
        label="Dates"
        options={dateOptions}
        selected={selectedDates}
        onToggle={toggleDate}
        onToggleAll={toggleAllDates}
        allSelected={allDatesSelected}
      />

      {availableVariants.length > 1 && (
        <MultiSelectDropdown
          label="Versions"
          options={variantOptions}
          selected={selectedVariants}
          onToggle={toggleVariant}
          onToggleAll={toggleAllVariants}
          allSelected={allVariantsSelected}
        />
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex h-9 items-center gap-1 rounded px-2 text-xs transition-colors hover:bg-[rgb(var(--surface-muted))]"
          style={{ color: 'rgb(var(--text-muted))' }}
          title="Reset all filters"
        >
          <X className="h-3 w-3" />
          Reset
        </button>
      )}
    </div>
  );
};

export default ShowtimesToolbar;
