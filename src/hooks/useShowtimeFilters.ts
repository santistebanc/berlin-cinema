import { useState, useEffect, useMemo } from 'react';
import { Movie } from '../types';

export interface ShowtimeFilters {
  selectedCinemas: string[];
  selectedDates: string[];
  selectedVariants: string[];
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
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
  const [selectedCinemas, setSelectedCinemas] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const available = useMemo(
    () => movie ? getAvailable(movie) : { cinemas: [], dates: [], variants: [] },
    [movie]
  );

  useEffect(() => {
    if (movie) {
      setSelectedCinemas(available.cinemas);
      setSelectedDates(available.dates);
      setSelectedVariants(available.variants);
    }
  }, [movie]);

  return {
    selectedCinemas,
    selectedDates,
    selectedVariants,
    showFilters,
    setShowFilters,
    toggleCinema: v => setSelectedCinemas(prev => prev.includes(v) ? prev.filter(c => c !== v) : [...prev, v]),
    toggleDate: v => setSelectedDates(prev => prev.includes(v) ? prev.filter(d => d !== v) : [...prev, v]),
    toggleVariant: v => setSelectedVariants(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]),
    resetFilters: () => {
      setSelectedCinemas(available.cinemas);
      setSelectedDates(available.dates);
      setSelectedVariants(available.variants);
    },
    availableCinemas: available.cinemas,
    availableDates: available.dates,
    availableVariants: available.variants,
  };
}
