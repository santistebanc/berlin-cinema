import React from 'react';
import { Movie } from '../types';
import { matchesFilters } from '../utils/cinemaUtils';
import ShowingEntry from './ShowingEntry';

interface Props {
  showings: Movie['showings'];
  selectedDates: string[];
  selectedCinemas: string[];
  selectedVariants: string[];
  cinemaColors: Record<string, string>;
  onCinemaClick: (name: string) => void;
}

const ShowtimesStacked: React.FC<Props> = ({
  showings,
  selectedDates,
  selectedCinemas,
  selectedVariants,
  cinemaColors,
  onCinemaClick,
}) => {
  const filteredDates = Object.keys(showings)
    .filter(date =>
      (selectedDates.length === 0 || selectedDates.includes(date)) &&
      Object.values(showings[date]).some(slots =>
        slots.some(s => matchesFilters(s, selectedCinemas, selectedVariants))
      )
    )
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return (
    // No overflow set here: any ancestor with overflow other than visible becomes
    // the sticky containing block, which stops the date headers below from
    // sticking to the window as you scroll.
    <div className="rounded-xl border" style={{ borderColor: 'rgb(var(--border))' }}>
      {filteredDates.map((date, dateIdx) => {
        const dateShowings = showings[date];
        const filteredTimes = Object.keys(dateShowings)
          .filter(time => dateShowings[time].some(s => matchesFilters(s, selectedCinemas, selectedVariants)))
          .sort();

        return (
          <div key={date} className={dateIdx > 0 ? 'border-t' : ''} style={{ borderColor: 'rgb(var(--border))' }}>
            <div
              className={dateIdx === 0 ? 'sticky top-0 z-10 flex items-baseline gap-2 rounded-t-xl px-4 py-2' : 'sticky top-0 z-10 flex items-baseline gap-2 px-4 py-2'}
              style={{ backgroundColor: 'rgb(var(--surface-muted))', borderBottom: '1px solid rgb(var(--border))' }}
            >
              <span className="text-[13px] font-bold" style={{ color: 'rgb(var(--text))' }}>
                {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span className="text-[13px]" style={{ color: 'rgb(var(--text-muted))' }}>
                {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </span>
            </div>
            {filteredTimes.map((time, timeIdx) => {
              const showingsList = dateShowings[time].filter(s =>
                matchesFilters(s, selectedCinemas, selectedVariants)
              );
              return (
                <div
                  key={time}
                  className="flex gap-3 px-4 py-2"
                  style={{ borderTop: timeIdx > 0 ? '1px solid rgb(var(--border) / .4)' : undefined }}
                >
                  <span className="tabular w-11 shrink-0 pt-0.5 font-mono text-[13.5px]" style={{ color: 'rgb(var(--text-soft))' }}>
                    {time}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {showingsList.map((showing, idx) => (
                      <ShowingEntry
                        key={idx}
                        cinema={showing.cinema}
                        variants={showing.variants}
                        colorClass={cinemaColors[showing.cinema] ?? ''}
                        label={showing.cinema}
                        onCinemaClick={onCinemaClick}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default ShowtimesStacked;
