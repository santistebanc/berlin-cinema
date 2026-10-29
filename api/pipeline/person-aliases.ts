import type { PipelineStore } from './store';

/** Provider aliases belong to a credited person ID, never to an approximate spelling. */
export function cachedDirectorAliases(store: PipelineStore, bundle: any, now: string): string[] {
  return [...new Set<string>((bundle?.credits?.crew ?? [])
    .filter((person: any) => ['Director', 'Co-Director'].includes(person.job) && Number.isInteger(person.id) && person.id > 0)
    .flatMap((credit: any) => {
      const resource = store.resource(`tmdb-person:${credit.id}`);
      if (!resource || resource.data?.id !== credit.id || !Number.isFinite(Date.parse(resource.fetchedAt))
        || Date.parse(now) - Date.parse(resource.fetchedAt) > 7 * 86400000) return [];
      return [resource.data.name, ...(Array.isArray(resource.data.also_known_as) ? resource.data.also_known_as : [])]
        .filter(value => typeof value === 'string' && value.trim());
    }))];
}
