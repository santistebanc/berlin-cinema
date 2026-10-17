import type { SourceCollection } from '../../shared/contracts';
import { translateLegacyBatch } from '../pipeline/observations';
import { collectFilmDetails, collectVenueDetails } from './details';
import type { SourceAdapter, SourceDependencies, SourceInstance } from './types';

/** Compatibility is confined to existing scraper rows; upstream record keys remain unchanged. */
export function replayLegacy(raw: any, instance: SourceInstance): SourceCollection {
  if (raw?.schemaVersion === 1 && raw?.records) return raw;
  const collection = translateLegacyBatch({ source: instance.id, movies: raw?.movies, observedAt: raw?.scrapedAt,
    complete: raw?.complete !== false, status: 'cached' }) as SourceCollection;
  collection.adapterId = instance.adapterId;
  return collection;
}
export async function legacyCollection(movies: any[], complete: boolean, instance: SourceInstance,
  adapter: SourceAdapter, deps: SourceDependencies): Promise<SourceCollection> {
  const observedAt = deps.now();
  if (!movies.some(movie => movie.showings?.length)) throw new Error(`${instance.id} returned no usable listings; source completeness is unknown`);
  const venueResources = await collectVenueDetails(movies, instance, adapter, deps, { maxLookups: instance.limits.venueDetails, force: deps.force });
  for (const [key, detail] of venueResources) deps.cache.set(key, detail, detail.fetchedAt);
  const filmResources = await collectFilmDetails(movies, adapter, deps, { maxLookups: instance.limits.filmDetails, force: deps.force });
  for (const [url, detail] of filmResources) deps.cache.set(`source-detail:${url}`, detail, detail.fetchedAt);
  const collection = translateLegacyBatch({ source: instance.id, movies, observedAt, complete, status: 'fresh' }) as SourceCollection;
  collection.adapterId = adapter.id; collection.extractionVersion = adapter.extractionVersion;
  for (const record of collection.records) record.provenance.extractionVersion = adapter.extractionVersion;
  return collection;
}
