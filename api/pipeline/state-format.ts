import { z } from 'zod';
import { EvidenceValueSchema, ListingDataSchema, ProvenanceSchema, TimestampSchema } from '../../shared/contracts';

const object = z.record(z.string(), z.any());
const observation = z.object({ id: z.string(), subject: z.string(), source: z.string(), sourceKey: z.string(),
  kind: z.enum(['listing', 'venue', 'screening', 'metadata']), observedAt: TimestampSchema, fetchedAt: TimestampSchema,
  fingerprint: z.string(), data: object, provenance: ProvenanceSchema.optional(), fields: z.record(z.string(), EvidenceValueSchema).optional() }).passthrough();
const stateSchema = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]), revision: z.number().int().nonnegative(),
  observations: z.record(z.string(), observation),
  heads: z.record(z.string(), z.object({ id: z.string(), observedAt: TimestampSchema, active: z.boolean(), withdrawnAt: TimestampSchema.optional() }).passthrough()),
  entities: z.record(z.string(), z.object({ id: z.string(), kind: z.enum(['film', 'programme', 'venue']), name: z.string(), data: object }).passthrough()),
  links: z.record(z.string(), z.object({ entityId: z.string(), evidence: z.string(), method: z.string() }).passthrough()),
  decisions: object, issues: z.record(z.string(), z.object({ id: z.string(), type: z.string(), subject: z.string(), title: z.string(),
    status: z.enum(['open', 'caution', 'resolved']), priority: z.number(), fingerprint: z.string(), details: object,
    firstSeenAt: TimestampSchema, lastSeenAt: TimestampSchema }).passthrough()),
  overrides: z.array(z.object({ id: z.string(), subject: z.string(), action: z.enum(['link', 'separate', 'patch', 'dismiss']),
    createdAt: TimestampSchema, evidenceFingerprint: z.string(), reason: z.string(), actor: z.string() }).passthrough()),
  fields: z.record(z.string(), z.array(z.object({ field: z.string(), value: z.any(), source: z.string(), observationId: z.string().nullable(),
    observedAt: TimestampSchema, selectedAt: TimestampSchema, reason: z.string(), identityVerified: z.boolean() }).passthrough())),
  resources: z.record(z.string(), z.object({ fetchedAt: TimestampSchema, data: z.any() }).passthrough()),
  spend: object, snapshots: z.array(z.object({ id: z.number(), revision: z.number(), createdAt: TimestampSchema, data: z.any() }).passthrough()),
  runs: z.array(object), jobs: z.array(object) }).passthrough();

/** Historical v1 reader is deliberately retained. Reading never edits or renews evidence. */
export function readState(input: any): any {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Unsupported or invalid pipeline state; refusing to overwrite it: ${parsed.error.message}`);
  for (const [id, value] of Object.entries(input.observations) as [string, any][]) {
    if (id !== value.id || value.provenance && (value.provenance.sourceInstanceId !== value.source || value.provenance.recordId !== value.sourceKey))
      throw new Error(`Invalid observation attribution: ${id}`);
    if (input.schemaVersion === 2 && !value.provenance) throw new Error(`Missing v2 observation attribution: ${id}`);
  }
  for (const [subject, head] of Object.entries(input.heads) as [string, any][]) {
    if (input.observations[head.id]?.subject !== subject) throw new Error(`Invalid state head: ${subject}`);
  }
  for (const [id, entity] of Object.entries(input.entities) as [string, any][]) {
    if (id !== entity.id) throw new Error(`Invalid state entity identity: ${id}`);
  }
  for (const [subject, link] of Object.entries(input.links) as [string, any][]) {
    if (!input.heads[subject] || !input.entities[link.entityId]) throw new Error(`Invalid state identity link: ${subject}`);
  }
  return input;
}

export function migrateState(input: any): any {
  readState(input);
  const state = structuredClone(input);
  if (state.schemaVersion === 2) return state;
  for (const item of Object.values(state.observations) as any[]) {
    const head = state.heads[item.subject];
    attributeHistoricalObservation(item, head?.id === item.id ? head.observedAt : item.observedAt);
  }
  state.schemaVersion = 2;
  return readState(state);
}

export function attributeHistoricalObservation(item: any, lastObservedAt = item.observedAt) {
    item.provenance ??= { sourceInstanceId: item.source, recordId: item.sourceKey,
      originalLabel: item.data.rawTitle ?? item.data.title ?? item.data.name ?? '', sourceUrl: item.data.url ?? null,
      observedAt: lastObservedAt, fetchedAt: item.fetchedAt, extractionVersion: 'retained-state-v1', upstreamLineage: [] };
    if (item.kind === 'listing') item.fields ??= Object.fromEntries(Object.keys(ListingDataSchema.shape)
      .map(field => [field, item.data[field] == null ? { state: 'unknown' } : { state: 'known', value: item.data[field] }]));
  return item;
}
