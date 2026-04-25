import React from 'react';
import { X } from 'lucide-react';
import FilterSection from './FilterSection';
import SelectableChip from './SelectableChip';
import Button from './ui/Button';

interface Props {
  visible: boolean;
  availableCinemas: string[];
  availableDates: string[];
  availableVariants: string[];
  selectedCinemas: string[];
  selectedDates: string[];
  selectedVariants: string[];
  cinemaColors: Record<string, string>;
  toggleCinema: (cinema: string) => void;
  toggleDate: (date: string) => void;
  toggleVariant: (variant: string) => void;
  resetFilters: () => void;
}

const FiltersPanel: React.FC<Props> = ({
  visible,
  availableCinemas,
  availableDates,
  availableVariants,
  selectedCinemas,
  selectedDates,
  selectedVariants,
  cinemaColors,
  toggleCinema,
  toggleDate,
  toggleVariant,
  resetFilters,
}) => {
  if (!visible) return null;

  return (
    <div className="ui-muted-surface space-y-4 border-b px-3 py-4 sm:px-5">
      <h2 className="section-title">Filters</h2>

      <FilterSection title="Cinemas">
        {availableCinemas.map(cinema => (
          <SelectableChip
            key={cinema}
            active={selectedCinemas.includes(cinema)}
            className={cinemaColors[cinema]}
            onClick={() => toggleCinema(cinema)}
          >
            {cinema}
          </SelectableChip>
        ))}
      </FilterSection>

      <FilterSection title="Dates">
        {availableDates.map(date => (
          <SelectableChip
            key={date}
            active={selectedDates.includes(date)}
            className="border-[rgb(var(--info-border))] bg-[rgb(var(--info-soft))] text-[rgb(var(--info-text))]"
            onClick={() => toggleDate(date)}
          >
            {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </SelectableChip>
        ))}
      </FilterSection>

      {availableVariants.length > 0 && (
        <FilterSection title="Variants">
          {availableVariants.map(variant => (
            <SelectableChip
              key={variant}
              active={selectedVariants.includes(variant)}
              className="border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent-text))]"
              inactiveClassName="border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] text-[rgb(var(--text-muted))] hover:border-[rgb(var(--accent)/0.35)] hover:bg-[rgb(var(--accent-soft))]"
              onClick={() => toggleVariant(variant)}
            >
              {variant}
            </SelectableChip>
          ))}
        </FilterSection>
      )}

      <div className="border-t pt-3" style={{ borderColor: 'rgb(var(--border))' }}>
        <Button onClick={resetFilters} variant="outline" size="sm" className="gap-1">
          <X className="h-3 w-3" />
          Reset filters
        </Button>
      </div>
    </div>
  );
};

export default FiltersPanel;
