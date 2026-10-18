import { EvidenceValueSchema, ListingDataSchema, ScreeningDataSchema, VenueDataSchema } from '../../shared/contracts';

export const sourceDataSchema = (kind: unknown) => kind === 'listing' ? ListingDataSchema
  : kind === 'venue' ? VenueDataSchema : kind === 'screening' ? ScreeningDataSchema : null;

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
  const schema = sourceDataSchema(record?.kind);
  if (schema) for (const [field, fieldSchema] of Object.entries(schema.shape)) {
    const checked = fieldSchema.safeParse(data[field]);
    if (checked.success) data[field] = checked.data;
    else delete data[field];
  }
  // A fallback label cannot replace an explicitly unavailable or malformed dimension.
  if (uncertainVariant) delete data.movieVariants;
  return data;
}
