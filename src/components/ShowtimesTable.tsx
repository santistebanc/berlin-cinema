import React from 'react';
import { Movie } from '../types';
import ShowtimesGrid from './ShowtimesGrid';
import ShowtimesStacked from './ShowtimesStacked';
import ShowtimesToolbar from './ShowtimesToolbar';

interface Props {
  movie: Movie;
  tableMode: 'grid' | 'stacked';
  setTableMode: (mode: 'grid' | 'stacked') => void;
  availableCinemas: string[];
  availableDates: string[];
  availableVariants: string[];
  selectedDates: string[];
  selectedCinemas: string[];
  selectedVariants: string[];
  toggleCinema: (v: string) => void;
  toggleDate: (v: string) => void;
  toggleVariant: (v: string) => void;
  resetFilters: () => void;
  cinemaColors: Record<string, string>;
  onCinemaClick: (name: string) => void;
}

const ShowtimesTable: React.FC<Props> = ({
  movie,
  tableMode,
  setTableMode,
  availableCinemas,
  availableDates,
  availableVariants,
  selectedDates,
  selectedCinemas,
  selectedVariants,
  toggleCinema,
  toggleDate,
  toggleVariant,
  resetFilters,
  cinemaColors,
  onCinemaClick,
}) => {
  const hasShowings = movie.showings && Object.keys(movie.showings).length > 0;

  if (!hasShowings) {
    return (
      <div className="body-muted py-8 text-center">
        No screenings match the current filters. Try enabling more cinemas, dates, or versions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto relative">
      <ShowtimesToolbar
        tableMode={tableMode}
        setTableMode={setTableMode}
        availableCinemas={availableCinemas}
        availableDates={availableDates}
        availableVariants={availableVariants}
        selectedCinemas={selectedCinemas}
        selectedDates={selectedDates}
        selectedVariants={selectedVariants}
        toggleCinema={toggleCinema}
        toggleDate={toggleDate}
        toggleVariant={toggleVariant}
        resetFilters={resetFilters}
      />

      <div>
        {tableMode === 'grid' ? (
          <ShowtimesGrid
            showings={movie.showings}
            selectedDates={selectedDates}
            selectedCinemas={selectedCinemas}
            selectedVariants={selectedVariants}
            cinemaColors={cinemaColors}
            onCinemaClick={onCinemaClick}
          />
        ) : (
          <ShowtimesStacked
            showings={movie.showings}
            selectedDates={selectedDates}
            selectedCinemas={selectedCinemas}
            selectedVariants={selectedVariants}
            cinemaColors={cinemaColors}
            onCinemaClick={onCinemaClick}
          />
        )}
      </div>
    </div>
  );
};

export default ShowtimesTable;
