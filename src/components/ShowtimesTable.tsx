import React, { useState } from 'react';
import { Movie } from '../types';
import ShowtimesGrid from './ShowtimesGrid';
import ShowtimesStacked from './ShowtimesStacked';
import ShowtimesToolbar from './ShowtimesToolbar';

interface Props {
  movie: Movie;
  selectedDates: string[];
  selectedCinemas: string[];
  selectedVariants: string[];
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  cinemaColors: Record<string, string>;
  onCinemaClick: (name: string) => void;
}

const ShowtimesTable: React.FC<Props> = ({
  movie,
  selectedDates,
  selectedCinemas,
  selectedVariants,
  showFilters,
  setShowFilters,
  cinemaColors,
  onCinemaClick,
}) => {
  const [tableMode, setTableMode] = useState<'grid' | 'stacked'>('stacked');

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
        onToggleFilters={() => setShowFilters(!showFilters)}
        setTableMode={setTableMode}
        showFilters={showFilters}
        tableMode={tableMode}
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
