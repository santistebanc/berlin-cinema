import { PipelineStore } from './store';
import { Observation, fingerprint, normalize } from './domain';
import { observation } from './observations';
import { parseLabel } from './labels';
import { creditNames } from './identity-evidence';
import { configuredRegistry } from '../sources/defaults';
import { sourceDependencies } from '../sources/dependencies';
import { collectFilmDetails } from '../sources/details';
import type { SourceRegistry } from '../sources/registry';
import type { SourceDependencies } from '../sources/types';
export { parseSourceDetails } from '../sources/compat';
export interface SourceDetails { url: string; fetchedAt: string; fields: Record<string, any>; failed?: boolean; parserVersion?: number; creditsChecked?: boolean; reason?: string }
import { detailKey } from '../sources/keys';
export { detailKey } from '../sources/keys';
export interface SourceRefreshOptions { network?: boolean; now?: string; force?: boolean; registry?: SourceRegistry; dependencies?: SourceDependencies; sourceInstanceId?: string }

/** Metadata reviews refer to entities, while identity reviews can refer directly to observations. */
function reviewSourceUrls(store: PipelineStore): Set<string> {
  const issues = store.issues().filter(issue => issue.status === 'open');
  const entities = new Set(issues.map(issue => issue.details.entityId).filter(Boolean));
  const urls = new Set<string>(issues.flatMap(issue => [issue.details.observation, ...(issue.details.observations ?? [])])
    .map(item => item?.data?.url).filter(Boolean));
  for (const listing of store.observations(undefined, true))
    if (listing.kind === 'listing' && entities.has(store.link(listing.subject)?.entityId) && listing.data.url) urls.add(listing.data.url);
  return urls;
}

/** Prioritize review evidence; dispatch extraction by configured adapter, never by hostname here. */
export async function fillSourceDetails(movies: any[], store: PipelineStore, maxLookups = 40,
  options: SourceRefreshOptions & { sourceFor?: (row: any) => string } = {}): Promise<Map<string, SourceDetails>> {
  const registry = options.registry ?? configuredRegistry();
  const deps = options.dependencies ?? sourceDependencies(store, options);
  const local = new Map<string, any>();
  const base = { ...deps, network: options.network === false ? false : deps.network,
    cache: { get: (key: string) => local.get(key) ?? deps.cache.get(key),
      set: (key: string, data: any, fetchedAt: string) => { local.set(key, { data, fetchedAt }); } } };
  const contexts = new Map(registry.instances.map(instance => [instance.id, registry.context(instance,
    { ...base, network: instance.enabled ? base.network : false })]));
  const fetched = new Map<string, SourceDetails>(); const unresolved = reviewSourceUrls(store);
  const instanceLookups = new Map<string, number>();
  let lookups = 0;
  for (const movie of [...movies].sort((a, b) => Number(unresolved.has(b.url)) - Number(unresolved.has(a.url)))) {
    let url: URL; try { url = new URL(movie.url); } catch { continue; }
    const source = options.sourceFor?.(movie) ?? options.sourceInstanceId;
    const instance = registry.instances.find(item => (!source || item.id === source)
      && registry.adapter(item).film?.accepts(url));
    if (!instance) continue;
    const context = contexts.get(instance.id)!;
    const resources = await collectFilmDetails([movie], registry.adapter(instance), context,
      { maxLookups: Math.min(maxLookups - lookups, instance.limits.filmDetails - (instanceLookups.get(instance.id) ?? 0)), force: options.force });
    for (const [key, details] of resources) {
      context.cache.set(detailKey(key), details, details.fetchedAt);
      fetched.set(options.sourceFor ? registry.cacheKey(instance, detailKey(key)) : key, details); lookups++;
      instanceLookups.set(instance.id, (instanceLookups.get(instance.id) ?? 0) + 1);
    }
  }
  return fetched;
}

/** Recalculation consumes detail evidence before identity resolution, without renewing listing freshness. */
export async function refreshListingObservations(store: PipelineStore, listings: Observation[], options: SourceRefreshOptions = {}): Promise<Observation[]> {
  const registry = options.registry ?? configuredRegistry();
  const rows = listings.map(item => structuredClone(item.data));
  const sources = new Map(rows.map((row, index) => [row, listings[index].source]));
  const sourceFor = (row: any) => sources.get(row)!;
  await fillSourceDetails(rows, store, 0, { ...options, sourceFor, network: false });
  const unresolvedUrls = reviewSourceUrls(store);
  const titles = new Map<string, Set<string>>();
  for (const row of rows) for (const title of [row.originalTitle, row.rawTitle || row.title, row.altTitle, row.displayTitle].filter(Boolean)) {
    if (!row.url || parseLabel(title).kind !== 'film') continue;
    const key = normalize(parseLabel(title).title);
    const urls = titles.get(key) ?? new Set<string>(); urls.add(row.url); titles.set(key, urls);
  }
  const duplicateUrls = new Set([...titles.values()].filter(urls => urls.size > 1).flatMap(urls => [...urls]));
  const fetched = await fillSourceDetails(rows.filter(row => unresolvedUrls.has(row.url) || duplicateUrls.has(row.url)
    && !(creditNames(row.director).length && row.year)), store, 40, { ...options, sourceFor });
  const changed = listings.map((item, index) => ({ item, data: rows[index] })).filter(({ item, data }) => fingerprint(item.data) !== fingerprint(data));
  if (changed.length || fetched.size) store.transaction(() => {
    for (const [key, details] of fetched) store.saveResource(key, details, details.fetchedAt);
    for (const { item, data } of changed) store.observe({ ...item, ...observation(item.source, item.kind, item.sourceKey, data,
      item.observedAt, data.sourceDetails?.fetchedAt ?? item.fetchedAt) });
  });
  return listings.map(item => store.head(item.subject)!);
}
