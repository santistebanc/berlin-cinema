import { EvidenceValueSchema, ListingDataSchema, ScreeningDataSchema, VenueDataSchema } from '../../shared/contracts';
import type { ZodType } from 'zod';

export const sourceDataSchema = (kind: unknown) => kind === 'listing' ? ListingDataSchema
  : kind === 'venue' ? VenueDataSchema : kind === 'screening' ? ScreeningDataSchema : null;

// Scope evidence has the v1 source-field types even when the record kind is invalid.
// Shared names must satisfy every defining contract; untyped extensions are unknown.
const scopeFieldSchemas = new Map<string, ZodType[]>();
for (const schema of [ListingDataSchema, VenueDataSchema, ScreeningDataSchema]) {
  for (const [field, fieldSchema] of Object.entries(schema.shape)) {
    scopeFieldSchemas.set(field, [...(scopeFieldSchemas.get(field) ?? []), fieldSchema]);
  }
}

/** Field states replace raw placeholders before either ingestion or scope interpretation. */
export function effectiveRecordData(record: any): Record<string, any> {
  const data = record?.data && typeof record.data === 'object' && !Array.isArray(record.data) ? { ...record.data } : {};
  for (const [field, raw] of Object.entries(record?.fields ?? {})) {
    const evidence = EvidenceValueSchema.safeParse(raw);
    if (evidence.success && evidence.data.state === 'known') data[field] = evidence.data.value;
    else if (!(evidence.success && evidence.data.state === 'unknown' && data[field] == null)) delete data[field];
  }
  return data;
}

/** A rejected row can still locate a failure, using only individually valid dimensions. */
export function recordScopeData(record: any): Record<string, any> {
  const data = effectiveRecordData(record);
  const uncertainVariant = Object.hasOwn(record?.fields ?? {}, 'variant') && (typeof data.variant !== 'string' || !data.variant.trim())
    || data.variant != null && !ScreeningDataSchema.shape.variant.safeParse(data.variant).success;
  for (const field of Object.keys(data)) {
    const schemas = scopeFieldSchemas.get(field);
    if (!schemas || !schemas.every(schema => schema.safeParse(data[field]).success)) delete data[field];
  }
  // A fallback label cannot replace an explicitly unavailable or malformed dimension.
  if (uncertainVariant) delete data.movieVariants;
  return data;
}
