import type { ScrapingResult } from '../types';
import { currentSnapshot } from '../utils/liveSnapshot';

/** A failed reload retains eligible prior data, with its original freshness timestamps. */
export async function loadMovieData(load: () => Promise<unknown>, previous: ScrapingResult | null, now = new Date()):
Promise<{ snapshot: ScrapingResult | null; error: string | null }> {
  try {
    return { snapshot: currentSnapshot(await load() as ScrapingResult, now), error: null };
  } catch (error) {
    return { snapshot: previous ? currentSnapshot(previous, now) : null,
      error: `Failed to load movies: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
