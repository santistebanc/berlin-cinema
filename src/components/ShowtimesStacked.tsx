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
    .filter(date => selectedDates.length === 0 || selectedDates.includes(date))
    .filter(date =>
      Object.values(showings[date]).some(slots =>
        slots.some(s => matchesFilters(s, selectedCinemas, selectedVariants))
      )
    )
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return (
    <div>
      {filteredDates.map(date => {
        const dateShowings = showings[date];
        const filteredTimes = Object.keys(dateShowings)
          .filter(time => dateShowings[time].some(s => matchesFilters(s, selectedCinemas, selectedVariants)))
          .sort();

        return (
          <div key={date}>
            <div
              className="border-y px-3 py-2"
              style={{ backgroundColor: 'rgb(var(--surface-muted))', borderColor: 'rgb(var(--border))' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'rgb(var(--text))' }}>
                {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className="ml-1.5 text-xs" style={{ color: 'rgb(var(--text-muted))' }}>
                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <table className="w-full table-fixed">
              <tbody>
                {filteredTimes.map(time => {
                  const showingsList = dateShowings[time].filter(s =>
                    matchesFilters(s, selectedCinemas, selectedVariants)
                  );
                  return (
                    <tr
                      key={time}
                      className="border-b transition-colors hover:bg-[rgb(var(--surface-muted)/0.5)]"
                      style={{ borderColor: 'rgb(var(--border) / 0.4)' }}
                    >
                      <td
                        className="tabular w-14 whitespace-nowrap bg-[rgb(var(--surface-muted))] px-2 py-1.5 font-mono text-sm"
                        style={{ color: 'rgb(var(--text-muted))' }}
                      >
                        {time}
                      </td>
                      <td className="w-full px-2 py-1.5">
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {showingsList.map((showing, idx) => (
                            <div
                              key={idx}
                              className="flex min-w-0 items-center"
                            >
                              <ShowingEntry
                                cinema={showing.cinema}
                                variant={showing.variant}
                                colorClass={cinemaColors[showing.cinema] ?? ''}
                                label={showing.cinema}
                                onCinemaClick={onCinemaClick}
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

export default ShowtimesStacked;
