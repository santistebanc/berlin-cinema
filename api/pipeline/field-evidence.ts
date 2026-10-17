import { fingerprint, type FieldValue, type Observation } from './domain';
import type { FieldEvidenceRole } from '../../shared/contracts';

/** Recognize detail evidence by its retained structured attribution, never explanation copy. */
export function isDetailValue(observation: Observation | undefined, field: string, value: any): boolean {
  const data = observation?.data;
  const comparable = (item: any) => field === 'year' && /^\d{4}$/.test(String(item)) ? Number(item) : item;
  return !!data?.sourceDetails && !data.sourceDetails.failed
    && Object.hasOwn(data.listingFields ?? {}, field) && data.listingFields[field] == null
    && Object.hasOwn(data.sourceDetails.fields ?? {}, field)
    && fingerprint(comparable(data.sourceDetails.fields[field])) === fingerprint(comparable(value));
}

/** Compatibility view: keep historical bytes/IDs intact and derive only what structured evidence establishes. */
export function fieldEvidenceRole(field: FieldValue, observation?: Observation): FieldEvidenceRole {
  if (field.evidenceRole) return field.evidenceRole;
  if (field.source === 'manual' && field.correctionId) return 'manual-correction';
  if (field.identityVerified && field.source.startsWith('TMDb:')) return 'tmdb';
  if (field.identityVerified && field.source.startsWith('OMDb:')) return 'omdb';
  if (observation?.source === field.source && isDetailValue(observation, field.field, field.value)) return 'source-detail';
  return observation?.source === field.source ? 'listing' : 'historical';
}
