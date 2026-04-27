import React, { useEffect, useRef } from 'react';
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

const ShowtimesGrid: React.FC<Props> = ({
  showings,
  selectedDates,
  selectedCinemas,
  selectedVariants,
  cinemaColors,
  onCinemaClick,
}) => {
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    const header = headerRef.current;
    if (!body || !header) return;
    const sync = () => { header.scrollLeft = body.scrollLeft; };
    body.addEventListener('scroll', sync, { passive: true });
    return () => body.removeEventListener('scroll', sync);
  }, []);

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

  const tableMinWidth = 56 + datesWithShowings.length * 180;

  const colgroup = (
    <colgroup>
      <col style={{ width: 56, minWidth: 56, maxWidth: 56 }} />
    </colgroup>
  );

  return (
    <div>
      {/* Sticky header — clipped, synced to body scroll via native listener */}
      <div
        ref={headerRef}
        className="sticky z-20 overflow-hidden"
        style={{ top: 0, borderBottom: '1px solid rgb(var(--border) / 0.4)' }}
      >
        <table
          className="w-full table-fixed"
          style={{ minWidth: tableMinWidth, backgroundColor: 'rgb(var(--surface-muted))' }}
        >
          {colgroup}
          <thead>
            <tr>
              <th
                className="sticky left-0 whitespace-nowrap px-2 py-2 text-left text-xs font-semibold"
                style={{ backgroundColor: 'rgb(var(--surface-muted))', color: 'rgb(var(--text))' }}
              >
                Time
              </th>
              {datesWithShowings.map(date => (
                <th
                  key={date}
                  className="px-1 py-2 text-left text-xs font-semibold"
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
        </table>
      </div>

      {/* Scrollable body */}
      <div ref={bodyRef} className="overflow-x-auto">
        <table className="w-full table-fixed" style={{ minWidth: tableMinWidth }}>
          {colgroup}
          <tbody>
            {allTimes.map(time => (
              <tr
                key={time}
                className="border-b transition-colors hover:bg-[rgb(var(--surface-muted)/0.5)]"
                style={{ borderColor: 'rgb(var(--border) / 0.4)' }}
              >
                <td
                  className="tabular sticky left-0 z-10 whitespace-nowrap bg-[rgb(var(--surface))] px-2 py-1 font-mono text-sm"
                  style={{ color: 'rgb(var(--text-soft))' }}
                >
                  {time}
                </td>
                {datesWithShowings.map(date => {
                  const filtered = (showings[date][time] || []).filter(s =>
                    matchesFilters(s, selectedCinemas, selectedVariants)
                  );
                  return (
                    <td key={date} className="max-w-[120px] px-1 py-1 text-left">
                      {filtered.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {filtered.map((showing, idx) => (
                            <ShowingEntry
                              key={idx}
                              cinema={showing.cinema}
                              variant={showing.variant}
                              colorClass={cinemaColors[showing.cinema] ?? ''}
                              label={showing.cinema}
                              onCinemaClick={onCinemaClick}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-9 items-center px-2 text-xs" style={{ color: 'rgb(var(--text-soft))' }}>—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ShowtimesGrid;
