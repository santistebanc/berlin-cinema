import type { ScrapingResult } from '../types';
import { currentSnapshot } from '../utils/liveSnapshot';
import { InvalidPublicSnapshotError } from '../../shared/contracts';

export type MovieDataState = 'ready' | 'empty' | 'expired' | 'unavailable';
export function movieDataState(snapshot: ScrapingResult | null): MovieDataState {
  return !snapshot ? 'unavailable' : snapshot.movies.length ? 'ready' : snapshot.programmeStatus === 'no-current-support' ? 'expired' : 'empty';
}

/** A failed reload retains eligible prior data, with its original freshness timestamps. */
export async function loadMovieData(load: () => Promise<unknown>, previous: ScrapingResult | null, now = new Date()):
Promise<{ snapshot: ScrapingResult | null; error: string | null; dataState: MovieDataState; loadState: 'loaded' | 'schema-failed' | 'transport-failed' }> {
  try {
    const snapshot = currentSnapshot(await load() as ScrapingResult, now);
    return { snapshot, error: null, dataState: movieDataState(snapshot), loadState: 'loaded' };
  } catch (error) {
    let snapshot: ScrapingResult | null = null;
    try { snapshot = previous ? currentSnapshot(previous, now) : null; } catch { /* Invalid prior data is never a fallback. */ }
    return { snapshot, dataState: movieDataState(snapshot), loadState: error instanceof InvalidPublicSnapshotError || error instanceof SyntaxError ? 'schema-failed' : 'transport-failed',
      error: `Failed to load movies: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
