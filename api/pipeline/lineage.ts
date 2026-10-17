import type { Observation } from './domain';

const roots = (values: string[] | undefined) => values?.map(value => value.trim().toLowerCase()).filter(Boolean) ?? [];
export function independentLineage(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = roots(left); const b = roots(right);
  return a.length > 0 && b.length > 0 && !a.some(value => b.includes(value));
}
/** Inherited provider fields cannot validate that same provider, including through another alias. */
export function providerDerived(observation: Observation, provider: string): boolean {
  return roots(observation.provenance?.upstreamLineage).some(value => value.includes(provider.toLowerCase()));
}
export function independentObservations(a: Observation, b: Observation): boolean {
  return a.source !== b.source && independentLineage(a.provenance?.upstreamLineage, b.provenance?.upstreamLineage);
}
