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
    .filter(date =>
      (selectedDates.length === 0 || selectedDates.includes(date)) &&
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

  const tableMinWidth = 64 + datesWithShowings.length * 180;

  const colgroup = (
    <colgroup>
      <col style={{ width: 64, minWidth: 64, maxWidth: 64 }} />
    </colgroup>
  );

  return (
    <div className="rounded-xl border" style={{ borderColor: 'rgb(var(--border))' }}>
      {/* Sticky header — clipped, synced to body scroll via native listener.
          Note: this outer wrapper must NOT set overflow itself — any ancestor
          with overflow other than visible becomes the sticky containing block,
          which stops the header from sticking to the window as you scroll. */}
      <div
        ref={headerRef}
        className="sticky z-20 overflow-hidden rounded-t-xl"
        style={{ top: 0, borderBottom: '1px solid rgb(var(--border))' }}
      >
        <table className="w-full table-fixed" style={{ minWidth: tableMinWidth, backgroundColor: 'rgb(var(--surface-muted))' }}>
          {colgroup}
          <thead>
            <tr>
              <th
                className="sticky left-0 whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: 'rgb(var(--surface-muted))', color: 'rgb(var(--text-soft))' }}
              >
                Time
              </th>
              {datesWithShowings.map(date => (
                <th key={date} className="border-l px-3 py-2.5 text-left" style={{ borderColor: 'rgb(var(--border))' }}>
                  <div className="whitespace-nowrap">
                    <span className="text-sm font-bold" style={{ color: 'rgb(var(--text))' }}>
                      {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                    </span>
                    <span className="ml-1.5 text-sm" style={{ color: 'rgb(var(--text-muted))' }}>
                      {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      {/* Scrollable body */}
      <div ref={bodyRef} className="overflow-x-auto rounded-b-xl">
        <table className="w-full table-fixed" style={{ minWidth: tableMinWidth }}>
          {colgroup}
          <tbody>
            {allTimes.map(time => (
              <tr key={time} className="border-t" style={{ borderColor: 'rgb(var(--border) / .4)' }}>
                <td
                  className="tabular sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 align-top font-mono text-sm"
                  style={{ backgroundColor: 'rgb(var(--surface))', color: 'rgb(var(--text-soft))' }}
                >
                  {time}
                </td>
                {datesWithShowings.map(date => {
                  const filtered = (showings[date][time] || []).filter(s =>
                    matchesFilters(s, selectedCinemas, selectedVariants)
                  );
                  return (
                    <td key={date} className="border-l px-2 py-1.5 align-top" style={{ borderColor: 'rgb(var(--border) / .4)' }}>
                      {filtered.length > 0 ? (
                        <div className="flex min-w-0 flex-col gap-1">
                          {filtered.map((showing, idx) => (
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
                      ) : (
                        <div className="flex min-h-8 items-center px-1 text-xs" style={{ color: 'rgb(var(--text-soft))' }}>—</div>
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
