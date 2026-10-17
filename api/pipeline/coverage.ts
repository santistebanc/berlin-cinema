import { DateSchema, type Coverage } from '../../shared/contracts';
import type { Observation } from './domain';
import { fingerprint } from './domain';
import type { PipelineStore } from './store';

// Empty or malformed evidence is unknown, including arrays with even one invalid alternative.
const usableFilter = (value: any, key: string): boolean => typeof value === 'boolean' && key !== 'variant' && key !== 'variants'
  || typeof value === 'string' && !!value.trim()
  || Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && !!item.trim());

/** Filters are conjunctive; array values are alternatives. Unknown values never prove membership. */
export function inCoverage(scope: Coverage, data: Record<string, any>, cinemaRecordId?: string): boolean {
  if (scope.cinemaRecordIds.length && !scope.cinemaRecordIds.includes(cinemaRecordId ?? '')) return false;
  if (scope.dateRange && !(data.date >= scope.dateRange.from && data.date <= scope.dateRange.to)) return false;
  return Object.entries(scope.filters).every(([key, expected]) => {
    const value = key === 'variant' || key === 'variants' ? data.variant ?? data.movieVariants : data[key];
    const alternatives = Array.isArray(expected) ? expected : [expected];
    return (Array.isArray(value) ? value : [value]).some(item => alternatives.includes(item));
  });
}

/** Reject only partitions which may contain the invalid evidence; missing dimensions remain conservative. */
export function affectedCoverage(scope: Coverage, raw: any, records: any[]): boolean {
  if (Array.isArray(raw?.cinemaRecordIds)) {
    if (scope.cinemaRecordIds.length && raw.cinemaRecordIds.length
      && raw.cinemaRecordIds.every(id => typeof id === 'string' && !!id.trim())
      && !raw.cinemaRecordIds.some(id => scope.cinemaRecordIds.includes(id))) return false;
    if (scope.dateRange && DateSchema.safeParse(raw.dateRange?.from).success && DateSchema.safeParse(raw.dateRange?.to).success
      && raw.dateRange.from <= raw.dateRange.to && (raw.dateRange.to < scope.dateRange.from || raw.dateRange.from > scope.dateRange.to)) return false;
    for (const [key, expected] of Object.entries(scope.filters)) {
      if (!usableFilter(expected, key)) continue;
      const other = key === 'variant' || key === 'variants' ? raw.filters?.variant ?? raw.filters?.variants : raw.filters?.[key];
      if (!usableFilter(other, key)) continue;
      const alternatives = Array.isArray(expected) ? expected : [expected];
      if (!(Array.isArray(other) ? other : [other]).some(value => alternatives.includes(value))) return false;
    }
    return true;
  }
  if (raw?.kind === 'listing') {
    const dependents = records.filter(record => record?.kind === 'screening' && record.data?.listingRecordId === raw.recordId);
    return !dependents.length || dependents.some(record => affectedCoverage(scope, record, records));
  }
  const cinema = raw?.kind === 'venue' ? raw.recordId : raw?.data?.venueRecordId;
  if (typeof cinema === 'string' && cinema.trim() && scope.cinemaRecordIds.length && !scope.cinemaRecordIds.includes(cinema)) return false;
  const date = raw?.data?.date;
  if (DateSchema.safeParse(date).success && scope.dateRange && (date < scope.dateRange.from || date > scope.dateRange.to)) return false;
  // A known contradictory filter isolates a failure; unknown/invalid filter data cannot prove exclusion.
  for (const [key, expected] of Object.entries(scope.filters)) {
    if (!usableFilter(expected, key)) continue;
    const value = key === 'variant' || key === 'variants' ? raw?.data?.variant ?? raw?.data?.movieVariants : raw?.data?.[key];
    if (!usableFilter(value, key)) continue;
    const alternatives = Array.isArray(expected) ? expected : [expected];
    if (!(Array.isArray(value) ? value : [value]).some(item => alternatives.includes(item))) return false;
  }
  return true;
}

/** Withdraw screening support, then only orphaned omitted parents. Historical evidence stays intact. */
export function reconcileCoverage(store: PipelineStore, source: string, coverage: Coverage[], accepted: Observation[], at: string) {
  for (const scope of coverage) {
    const { status, emptyProgrammeConfirmed, ...dimensions } = scope;
    const key = `source-coverage:${source}:${fingerprint(dimensions)}`;
    const previous = store.resource(key)?.data;
    const value = { ...scope, observedAt: at };
    store.saveResource(`source-coverage-history:${source}:${fingerprint(value)}`, value, at);
    if (!previous || Date.parse(at) > Date.parse(previous.observedAt)
      || Date.parse(at) === Date.parse(previous.observedAt) && (previous.status !== 'complete' || status === 'complete'))
      store.saveResource(key, value, at);
  }
  const retained = new Set(accepted.map(item => item.subject));
  const eligible = (item: Observation) => item.kind === 'screening'
    && Date.parse(item.observedAt) <= Date.parse(at)
    && coverage.some(scope => scope.status === 'complete' && inCoverage(scope, item.data, store.head(item.data.venueSubject)?.sourceKey))
    && !coverage.some(scope => scope.status !== 'complete' && affectedCoverage(scope,
      { kind: 'screening', data: { ...item.data, venueRecordId: store.head(item.data.venueSubject)?.sourceKey } }, []));
  const parents = new Set(store.observations(source, true).filter(item => !retained.has(item.subject) && eligible(item))
    .flatMap(item => [item.data.listingSubject, item.data.venueSubject]));
  store.retireMissing(source, retained, eligible, at);
  const supported = new Set(store.observations(source, true).filter(item => item.kind === 'screening')
    .flatMap(item => [item.data.listingSubject, item.data.venueSubject]));
  store.retireMissing(source, retained, item => item.kind !== 'screening' && parents.has(item.subject)
    && !supported.has(item.subject) && Date.parse(item.observedAt) <= Date.parse(at), at);
}
