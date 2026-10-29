import { FieldValue, Observation, fingerprint } from './domain';
import type { ResolvedField, EvidenceValue } from '../../shared/contracts';
import { PipelineStore } from './store';
import { parseLabel } from './labels';
import { fieldEvidenceRole, isDetailValue } from './field-evidence';

export const sourceFields = ['director', 'cast', 'country', 'year', 'posterUrl', 'originalTitle', 'altTitle', 'runtime',
  'plot', 'genres', 'ageRating', 'germanReleaseDate', 'homepage'];
const present = (value: any) => value != null && value !== '' && (!Array.isArray(value) || value.length > 0);

/** Authority belongs to a field/evidence role, never a configured source's name. */
function authority(field: FieldValue): number {
  const role = fieldEvidenceRole(field);
  if (role === 'manual-correction' && field.source === 'manual' && field.correctionId) return 100;
  const provider = field.identityVerified && (role === 'tmdb' || role === 'omdb');
  const detail = role === 'source-detail';
  if (field.field === 'runtime') return detail ? 80 : provider ? 70 : 50;
  if (['imdbRating', 'imdbVotes', 'allRatings', 'awards'].includes(field.field))
    return provider && role === 'omdb' ? 90 : provider ? 80 : 40;
  return provider ? 80 : detail ? 60 : 40;
}

export function sourceCandidates(sources: Observation[], now: string, includeUrl = false): FieldValue[] {
  return sources.flatMap(observation => [...sourceFields, ...(includeUrl ? ['url'] : [])].flatMap(field => {
    if (field === 'runtime' && parseLabel(observation.data.rawTitle || observation.data.title).modality.edition) return [];
    let value = observation.data[field];
    if (field === 'year') value = Number(value) || parseLabel(observation.data.rawTitle || observation.data.title).year;
    if (!present(value)) return [];
    const detail = isDetailValue(observation, field, value);
    return [{ field, value, source: observation.source, observationId: observation.id,
      observedAt: detail ? observation.data.sourceDetails.fetchedAt : observation.observedAt,
      selectedAt: now, identityVerified: false, evidenceRole: detail ? 'source-detail' as const : 'listing' as const,
      reason: detail ? `Explicit source detail-page value (${observation.data.sourceDetails.url})` : 'Attributed listing evidence' }];
  }));
}

export function selectEvidence(candidates: FieldValue[], store?: PipelineStore, observations: Observation[] = []): { selected: Map<string, FieldValue>; fields: ResolvedField[] } {
  const selected = new Map<string, FieldValue>(); const fields: ResolvedField[] = [];
  for (const name of [...new Set(candidates.map(candidate => candidate.field))].sort()) {
    const values = candidates.filter(candidate => candidate.field === name);
    const instant = (value: FieldValue) => Date.parse(value.observedAt) || 0;
    values.sort((a, b) => authority(b) - authority(a) || instant(b) - instant(a));
    const best = values[0];
    const peers = values.filter(value => authority(value) === authority(best) && instant(value) === instant(best));
    const unique = [...new Map(peers.map(value => [fingerprint(value.value), value])).values()];
    const conflict = unique.length > 1;
    if (!conflict) selected.set(name, best);
    const correction = best.source === 'manual' && best.correctionId && store?.allOverrides().find(item => item.id === best.correctionId && !item.revokedAt && item.patch?.fields
      && Object.hasOwn(item.patch.fields, name) && fingerprint(item.patch.fields[name]) === fingerprint(best.value));
    fields.push({ field: name,
      value: conflict ? { state: 'unknown' } : best.value === null && correction
        ? { state: 'cleared', correctionId: correction.id, reason: correction.reason } : { state: 'known', value: best.value },
      reason: conflict ? `field-policy:${name}: equally authoritative current evidence conflicts; optional value withheld`
        : `field-policy:${name}: ${best.reason}; authority before evidence freshness`,
      supportingObservationIds: [...new Set(values.filter(value => conflict || fingerprint(value.value) === fingerprint(best.value))
        .flatMap(value => value.observationId ? [value.observationId] : []))],
      alternatives: [...new Map(values.filter(value => conflict || fingerprint(value.value) !== fingerprint(best.value))
        .map(value => [fingerprint(value.value), { state: 'known' as const, value: value.value }])).values()],
      unresolvedQuestions: conflict ? [`Which ${name} value is correct? Safe optional fallback is unspecified.`] : [] });
  }
  for (const name of [...new Set(observations.flatMap(item => Object.keys(item.fields ?? {})))].sort()) {
    const evidence = observations.flatMap(item => item.fields?.[name] && item.fields[name].state !== 'known'
      ? [{ id: item.id, value: item.fields[name] }] : []);
    if (!evidence.length) continue;
    const values = [...new Map(evidence.map(item => [fingerprint(item.value), item.value])).values()];
    const existing = fields.find(field => field.field === name);
    if (existing) { existing.alternatives.push(...values); continue; }
    const value: EvidenceValue = values.length === 1 && values[0].state !== 'cleared' ? values[0] : { state: 'unknown' };
    fields.push({ field: name, value, reason: 'No supported value; attributed absence, uncertainty and retrieval failures remain distinct from corrections',
      supportingObservationIds: evidence.map(item => item.id), alternatives: values.filter(item => fingerprint(item) !== fingerprint(value)), unresolvedQuestions: [] });
  }
  return { selected, fields };
}
