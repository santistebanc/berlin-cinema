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
  const allCinemasSelected = selectedCinemas.length === availableCinemas.length;
  const allDatesSelected = selectedDates.length === availableDates.length;
  const allVariantsSelected = selectedVariants.length === availableVariants.length;

  const hasFilters = !allCinemasSelected || !allDatesSelected || !allVariantsSelected;

  const cinemaOptions = availableCinemas.map(c => ({ value: c, label: c }));
  const dateOptions = availableDates.map(d => ({
    value: d,
    label: new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
  }));
  const variantOptions = availableVariants.map(v => ({ value: v, label: v }));

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
      <div
        role="group"
        aria-label="View mode"
        className="inline-flex shrink-0 gap-0.5 rounded-lg border p-0.5"
        style={{ borderColor: 'rgb(var(--border-strong))', backgroundColor: 'rgb(var(--surface-muted))' }}
      >
        <button
          type="button"
          onClick={() => setTableMode('stacked')}
          aria-pressed={tableMode === 'stacked'}
          className={cn(
            'inline-flex h-[30px] w-[34px] items-center justify-center rounded-md transition-colors',
            tableMode === 'stacked'
              ? 'bg-[rgb(var(--accent))] text-[rgb(10,14,23)]'
              : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))]'
          )}
          title="Stacked view"
        >
          <Columns className="h-[15px] w-[15px]" />
        </button>
        <button
          type="button"
          onClick={() => setTableMode('grid')}
          aria-pressed={tableMode === 'grid'}
          className={cn(
            'inline-flex h-[30px] w-[34px] items-center justify-center rounded-md transition-colors',
            tableMode === 'grid'
              ? 'bg-[rgb(var(--accent))] text-[rgb(10,14,23)]'
              : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))]'
          )}
          title="Grid view"
        >
          <LayoutGrid className="h-[15px] w-[15px]" />
        </button>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
    </div>
  );
};

export default ShowtimesToolbar;
