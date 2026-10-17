import { randomUUID } from 'crypto';
import { PipelineStore } from './store';
import { Observation, fingerprint } from './domain';
import { observation } from './observations';
import { configuredRegistry } from '../sources/defaults';
import { sourceDependencies } from '../sources/dependencies';
import { collectVenueDetails } from '../sources/details';
import type { SourceRefreshOptions } from './source-details';

export async function fillVenueDetails(movies: any[], store: PipelineStore, maxLookups = 100,
  options: SourceRefreshOptions & { persist?: boolean; sourceFor?: (cinema: any) => string } = {}): Promise<Map<string, any>> {
  const registry = options.registry ?? configuredRegistry();
  const deps = options.dependencies ?? sourceDependencies(store, options);
  const fetched = new Map<string, any>();
  for (const instance of registry.instances.filter(item => !options.sourceInstanceId || item.id === options.sourceInstanceId)) {
    const context = registry.context(instance, { ...deps, network: options.network === false || !instance.enabled ? false : deps.network });
    const selected = options.sourceFor ? movies.map(movie => ({ ...movie,
      cinemas: (movie.cinemas ?? []).filter((cinema: any) => options.sourceFor!(cinema) === instance.id) })) : movies;
    const resources = await collectVenueDetails(selected, instance, registry.adapter(instance), context,
      { maxLookups: Math.min(maxLookups - fetched.size, instance.limits.venueDetails), force: options.force });
    for (const [key, details] of resources) fetched.set(registry.cacheKey(instance, key), details);
  }
  const owner = randomUUID();
  if (options.persist !== false && fetched.size && store.acquireLease(owner)) {
    try { store.transaction(() => { for (const [key, details] of fetched) store.saveResource(key, details, details.fetchedAt); }); }
    finally { store.releaseLease(owner); }
  }
  return fetched;
}

/** Replays may repair venue facts without renewing the original listing/screening observation times. Caller owns the writer lease. */
export async function refreshVenueObservations(store: PipelineStore, venues: Observation[], options: SourceRefreshOptions & { maxLookups?: number } = {}): Promise<Observation[]> {
  const cinemas = venues.map(item => structuredClone(item.data));
  const sources = new Map(cinemas.map((cinema, index) => [cinema, venues[index].source]));
  const resources = await fillVenueDetails([{ cinemas }], store, options.maxLookups ?? 100,
    { ...options, persist: false, sourceFor: cinema => sources.get(cinema)! });
  const changed = venues.map((item, index) => ({ item, data: cinemas[index] })).filter(({ item, data }) => fingerprint(item.data) !== fingerprint(data));
  if (changed.length || resources.size) store.transaction(() => {
    for (const [key, details] of resources) store.saveResource(key, details, details.fetchedAt);
    for (const { item, data } of changed) store.observe({ ...item, ...observation(item.source, item.kind, item.sourceKey, data,
      item.observedAt, data.addressEvidence?.fetchedAt ?? item.fetchedAt) });
  });
  return venues.map(item => store.head(item.subject)!);
}
