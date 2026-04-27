import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Movie } from '../types';

export interface ShowtimeFilters {
  selectedCinemas: string[];
  selectedDates: string[];
  selectedVariants: string[];
  tableMode: 'grid' | 'stacked';
  setTableMode: (mode: 'grid' | 'stacked') => void;
  toggleCinema: (cinema: string) => void;
  toggleDate: (date: string) => void;
  toggleVariant: (variant: string) => void;
  resetFilters: () => void;
  availableCinemas: string[];
  availableDates: string[];
  availableVariants: string[];
}

function getAvailable(movie: Movie) {
  const cinemas = new Set<string>();
  const dates = Object.keys(movie.showings).sort();
  Object.values(movie.showings).forEach(dateShowings =>
    Object.values(dateShowings).forEach(timeShowings =>
      timeShowings.forEach(s => cinemas.add(s.cinema))
    )
  );
  return { cinemas: Array.from(cinemas).sort(), dates, variants: movie.variants || [] };
}

export function useShowtimeFilters(movie: Movie | null): ShowtimeFilters {
  const [searchParams, setSearchParams] = useSearchParams();

  const available = useMemo(
    () => movie ? getAvailable(movie) : { cinemas: [], dates: [], variants: [] },
    [movie]
  );

  const paramMode = searchParams.get('mode');
  const tableMode: 'grid' | 'stacked' = paramMode === 'grid' ? 'grid' : 'stacked';

  // URL stores excluded items (comma-separated). Absent key = nothing excluded = all selected.
  function parseExclusions(key: string): Set<string> {
    const raw = searchParams.get(key);
    return raw ? new Set(raw.split(',')) : new Set();
  }

  const excludedCinemas = parseExclusions('xc');
  const excludedDates = parseExclusions('xd');
  const excludedVariants = parseExclusions('xv');

  const selectedCinemas = available.cinemas.filter(c => !excludedCinemas.has(c));
  const selectedDates = available.dates.filter(d => !excludedDates.has(d));
  const selectedVariants = available.variants.filter(v => !excludedVariants.has(v));

  function setExclusions(key: string, excluded: Set<string>) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (excluded.size === 0) {
        next.delete(key);
      } else {
        next.set(key, Array.from(excluded).join(','));
      }
      return next;
    }, { replace: true });
  }

  function toggle(key: string, value: string, excluded: Set<string>) {
    const next = new Set(excluded);
    if (next.has(value)) next.delete(value); else next.add(value);
    setExclusions(key, next);
  }

  return {
    selectedCinemas,
    selectedDates,
    selectedVariants,
    tableMode,
    setTableMode: (mode) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (mode === 'stacked') next.delete('mode'); else next.set('mode', mode);
        return next;
      }, { replace: true });
    },
    toggleCinema: v => toggle('xc', v, excludedCinemas),
    toggleDate: v => toggle('xd', v, excludedDates),
    toggleVariant: v => toggle('xv', v, excludedVariants),
    resetFilters: () => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('xc');
        next.delete('xd');
        next.delete('xv');
        return next;
      }, { replace: true });
    },
    availableCinemas: available.cinemas,
    availableDates: available.dates,
    availableVariants: available.variants,
  };
}
