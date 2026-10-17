import { configuredRegistry, defaultRegistry } from './defaults';
import { parseFilmMetadata } from './film-metadata';
import { parseBerlinVenue } from './berlin-venue';
import { SourceRegistry } from './registry';
import { PipelineStore } from '../pipeline/store';
import { sourceDependencies } from './dependencies';
import type { SourceDependencies } from './types';

/** Existing extraction callers remain available; website interpretation lives with adapters. */
export function parseSourceDetails(html: string, sourceUrl?: string): Record<string, any> {
  if (!sourceUrl) return parseFilmMetadata(html);
  const url = new URL(sourceUrl);
  const extractor = defaultRegistry.instances.map(instance => defaultRegistry.adapter(instance).film).find(item => item?.accepts(url));
  return extractor?.extract(html, sourceUrl).fields ?? {};
}
export function parseVenueDetails(html: string, sourceUrl?: string): Record<string, string> | null {
  if (!sourceUrl) return parseBerlinVenue(html);
  const url = new URL(sourceUrl);
  const extractor = defaultRegistry.instances.map(instance => defaultRegistry.adapter(instance).venue).find(item => item?.accepts(url));
  return extractor?.extract(html, sourceUrl) ?? null;
}

/** Legacy scraper facade: acquisition still crosses the same registered adapter interface. */
export async function collectLegacyMovies(id: string, dependencies?: SourceDependencies): Promise<any[]> {
  const sources = configuredRegistry();
  const configured = sources.instance(id);
  if (!configured) throw new Error(`Source is not configured: ${id}`);
  const instance = { ...configured, limits: { ...configured.limits, filmDetails: 0, venueDetails: 0 } };
  const registry = new SourceRegistry([sources.adapter(instance)], [instance]);
  const store = new PipelineStore(':memory:');
  try {
    const [collection] = await registry.collect(dependencies ?? sourceDependencies(store));
    if (collection.status !== 'fresh') throw new Error(collection.message ?? 'Source collection failed');
    const venues = new Map(collection.records.filter(record => record.kind === 'venue').map(record => [record.recordId, record.data]));
    return collection.records.filter(record => record.kind === 'listing').map(listing => {
      const screenings = collection.records.filter(record => record.kind === 'screening' && record.data.listingRecordId === listing.recordId);
      const cinemas = [...new Set(screenings.map(record => String(record.data.venueRecordId)))].map(key => venues.get(key));
      return { ...listing.data, cinemas, showings: screenings.map(record => record.data) };
    });
  } finally { store.close(); }
}
