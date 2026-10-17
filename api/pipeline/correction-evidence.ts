import { fingerprint, Observation } from './domain';
import { PipelineStore } from './store';

/** Refresh timestamps, fetch outcomes and observation IDs are not changed facts. */
export function semanticEvidence(value: any): any {
  if (Array.isArray(value)) return value.map(semanticEvidence);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['observedAt', 'fetchedAt', 'selectedAt', 'firstSeenAt', 'lastSeenAt', 'observationId'].includes(key))
    .map(([key, item]) => [key, semanticEvidence(item)]));
  return value;
}
function observations(store: PipelineStore, id: string): Observation[] {
  const published = store.resource(`published-identity:film:${id}`)?.data ?? store.resource(`published-identity:programme:${id}`)?.data;
  const members = new Set([id, ...store.resources('published-identity:').filter(item => published && item.data.publicId === published.publicId).map(item => item.data.memberId)]);
  return store.observations(undefined, true).filter(item => members.has(store.link(item.subject)?.entityId));
}
export function fieldBaseline(store: PipelineStore, id: string, names: string[]) {
  return Object.fromEntries(names.map(name => [name, [...new Map(observations(store, id).flatMap(item => {
    const field = item.fields?.[name];
    const value = field?.state === 'known' ? field.value : item.data[name];
    if (value == null || field && ['unknown', 'failed', 'cleared'].includes(field.state)) return [];
    return [[fingerprint(semanticEvidence(value)), semanticEvidence(value)] as const];
  })).values()]]));
}
export function checkFieldCorrections(store: PipelineStore, id: string, now: string) {
  const superseded = new Set<string>();
  for (const correction of store.overrides(`entity:${id}`).filter(item => item.patch?.fields).reverse()) {
    const names = Object.keys(correction.patch!.fields).filter(name => !superseded.has(name));
    Object.keys(correction.patch!.fields).forEach(name => superseded.add(name));
    if (!correction.patch!.fieldBaseline) continue; // Legacy decisions retain their existing applicability.
    const current = fieldBaseline(store, id, names);
    const conflicts = names.filter(name => current[name].some(value => fingerprint(value) !== fingerprint(correction.patch!.fields[name])
      && !(correction.patch!.fieldBaseline[name] ?? []).some((old: any) => fingerprint(old) === fingerprint(value))));
    if (!conflicts.length) continue;
    store.issue({ type: 'correction-conflict', subject: `entity:${id}`, title: `Review changed correction evidence: ${store.entity(id)?.name}`,
      status: 'open', priority: 100, fingerprint: fingerprint({ correction: correction.id, fields: Object.fromEntries(conflicts.map(name => [name, current[name]])) }),
      details: { entityId: id, correction, fields: conflicts, observations: observations(store, id),
        reason: 'New contradictory facts affect corrected fields; equivalent refreshes and unrelated fields do not invalidate this decision.',
        fallback: 'Keep the saved field correction while its new contradictory evidence is reviewed.' } }, now);
  }
}
