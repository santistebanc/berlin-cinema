import React from 'react';
import { Movie } from '../types';
import { matchesFilters, getCinemaAbbr } from '../utils/cinemaUtils';
import ShowingEntry from './ShowingEntry';

interface Props {
  showings: Movie['showings'];
  selectedDates: string[];
  selectedCinemas: string[];
  selectedVariants: string[];
  cinemaColors: Record<string, string>;
  onCinemaClick: (name: string) => void;
}

const ShowtimesGrid: React.FC<Props> = ({
  showings,
  selectedDates,
  selectedCinemas,
  selectedVariants,
  cinemaColors,
  onCinemaClick,
}) => {
  const datesWithShowings = Object.keys(showings)
    .filter(date => selectedDates.length === 0 || selectedDates.includes(date))
    .filter(date =>
      Object.values(showings[date]).some(timeShowings =>
        timeShowings.some(s => matchesFilters(s, selectedCinemas, selectedVariants))
      )
    )
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const allTimes = Array.from(
    new Set(Object.values(showings).flatMap(ds => Object.keys(ds)))
  )
    .sort()
    .filter(time =>
      datesWithShowings.some(date => {
        const slots = showings[date][time];
        return slots && slots.some(s => matchesFilters(s, selectedCinemas, selectedVariants));
      })
    );

  return (
    <div className="relative overflow-x-auto" data-showings-scroll>
      <table className="relative w-full">
        <thead>
          <tr className="border-b" style={{ backgroundColor: 'rgb(var(--surface-muted))', borderColor: 'rgb(var(--border))' }}>
            <th
              className="sticky left-0 z-10 w-[56px] whitespace-nowrap px-2 py-2 text-left text-xs font-semibold shadow-sm"
              style={{ backgroundColor: 'rgb(var(--surface-muted))', color: 'rgb(var(--text))' }}
            >
              Time
            </th>
            {datesWithShowings.map(date => (
              <th
                key={date}
                className="min-w-[72px] max-w-[200px] w-[200px] px-2 py-2 text-left text-xs font-semibold"
                style={{ color: 'rgb(var(--text))' }}
              >
                <div className="whitespace-nowrap">
                  {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                  <span className="font-normal" style={{ color: 'rgb(var(--text-muted))' }}>
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTimes.map(time => (
            <tr
              key={time}
              className="border-b transition-colors hover:bg-[rgb(var(--surface-muted))]"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <td
                className="tabular sticky left-0 z-10 w-[56px] whitespace-nowrap bg-[rgb(var(--surface-muted))] px-2 py-1.5 font-mono text-sm shadow-sm"
                style={{ color: 'rgb(var(--text-muted))' }}
              >
                {time}
              </td>
              {datesWithShowings.map(date => {
                const filtered = (showings[date][time] || []).filter(s =>
                  matchesFilters(s, selectedCinemas, selectedVariants)
                );
                return (
                  <td key={date} className="max-w-[200px] px-2 py-1.5 text-left">
                    {filtered.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {filtered.map((showing, idx) => (
                          <ShowingEntry
                            key={idx}
                            cinema={showing.cinema}
                            variant={showing.variant}
                            colorClass={cinemaColors[showing.cinema] ?? ''}
                            label={getCinemaAbbr(showing.cinema)}
                            onCinemaClick={onCinemaClick}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs" style={{ color: 'rgb(var(--text-soft))' }}>—</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ShowtimesGrid;
