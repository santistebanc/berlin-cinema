import type { ScrapingResult } from '../types';
import { parsePublicSnapshot } from '../../shared/contracts';

/** Enforce source expiry even when a static/PWA snapshot is viewed long after publication. */
export function currentSnapshot(snapshot: ScrapingResult, now = new Date()): ScrapingResult {
  snapshot = parsePublicSnapshot(snapshot) as unknown as ScrapingResult;
  if (snapshot.schemaVersion !== 2) return snapshot;
  const clock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).replace(' ', 'T');
  const movies = snapshot.movies.map(movie => {
    const showings: typeof movie.showings = {};
    for (const [date, times] of Object.entries(movie.showings)) for (const [time, entries] of Object.entries(times)) {
      if (`${date}T${time}` < clock) continue;
      const current = entries.filter(entry => now.getTime() - Date.parse(entry.lastObservedAt ?? snapshot.scrapedAt) <= 86400000)
        .map(entry => ({ ...entry, stale: entry.stale || now.getTime() - Date.parse(entry.lastObservedAt ?? snapshot.scrapedAt) > 7 * 3600000 }));
      if (current.length) { showings[date] ??= {}; showings[date][time] = current; }
    }
    return { ...movie, showings };
  }).filter(movie => Object.keys(movie.showings).length);
  return { ...snapshot, movies, ...(typeof snapshot.totalMovies === 'number' ? { totalMovies: movies.length } : {}),
    ...('total' in snapshot ? { total: movies.length } : {}) };
}
