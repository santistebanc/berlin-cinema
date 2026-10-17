import { z } from 'zod';
import { Diagnostic, ListingDataSchema, TimestampSchema, VenueDataSchema } from '../../shared/contracts';
import { sanitizeAudit } from '../audit-log';
import { SourceBatch } from './domain';

const LegacyBatchSchema = z.object({ source: z.string().min(1), observedAt: TimestampSchema,
  status: z.enum(['fresh', 'cached', 'failed', 'skipped']), complete: z.boolean(), movies: z.array(z.unknown()), message: z.string().optional() });
export function sourceDiagnostic(sourceInstanceId: string, code: string, reason: string, evidence: unknown,
  path?: string, recordId?: string): Diagnostic {
  return { schemaVersion: 1, category: 'data-quality', stage: 'ingestion', sourceInstanceId, code, reason,
    retryable: false, evidence: sanitizeAudit(evidence), ...(path ? { path } : {}), ...(recordId ? { recordId } : {}) };
}

/** Explicit legacy compatibility: missing/null fields remain unknown; never infer absence. */
export function validateLegacyBatch(input: unknown): { batch: SourceBatch | null; source: string; diagnostics: Diagnostic[] } {
  const source = typeof (input as any)?.source === 'string' ? (input as any).source : 'unknown';
  const diagnostics: Diagnostic[] = [];
  const parsed = LegacyBatchSchema.safeParse(input);
  if (!parsed.success) return { batch: null, source, diagnostics: [sourceDiagnostic(source, 'invalid-envelope', parsed.error.message, input)] };
  const batch: SourceBatch = { ...parsed.data, movies: [] };
  if (batch.status === 'failed' || batch.status === 'skipped') return { batch, source, diagnostics };
  for (const [index, raw] of parsed.data.movies.entries()) {
    const record = raw as any;
    const label = record?.rawTitle || record?.title;
    if (!record || typeof label !== 'string' || !label.trim()) {
      diagnostics.push(sourceDiagnostic(source, 'invalid-record', 'Listing requires an original title label', raw, `movies.${index}`)); continue;
    }
    const clean = { ...record };
    // Check fields separately so a bad optional director/poster cannot discard a screening.
    for (const [field, schema] of Object.entries(ListingDataSchema.shape)) {
      if (field === 'rawTitle' || clean[field] === undefined) continue;
      const result = schema.safeParse(clean[field]);
      if (!result.success) {
        diagnostics.push(sourceDiagnostic(source, 'invalid-field', result.error.message, clean[field], `movies.${index}.${field}`));
        delete clean[field];
      }
    }
    for (const key of ['cinemas', 'showings']) {
      if (clean[key] == null) continue;
      if (!Array.isArray(clean[key])) {
        diagnostics.push(sourceDiagnostic(source, 'invalid-record', `Expected ${key} array`, clean[key], `movies.${index}.${key}`));
        clean[key] = []; continue;
      }
      clean[key] = clean[key].filter((row: any, rowIndex: number) => {
        const name = key === 'cinemas' ? row?.name : row?.cinema;
        if (!row || typeof name !== 'string' || !name.trim()) {
          diagnostics.push(sourceDiagnostic(source, 'invalid-record', 'Venue label is required', row, `movies.${index}.${key}.${rowIndex}`)); return false;
        }
        return true;
      }).map((row: any, rowIndex: number) => {
        const valid = { ...row };
        const shape = key === 'cinemas' ? VenueDataSchema.shape : { url: VenueDataSchema.shape.url,
          variant: z.string().nullable().optional(), sessionId: z.union([z.string(), z.number()]).nullable().optional(), auditorium: z.string().nullable().optional() };
        for (const [field, schema] of Object.entries(shape)) {
          if (field === 'name' || valid[field] === undefined) continue;
          const result = schema.safeParse(valid[field]);
          if (!result.success) {
            diagnostics.push(sourceDiagnostic(source, 'invalid-field', result.error.message, valid[field], `movies.${index}.${key}.${rowIndex}.${field}`)); delete valid[field];
          }
        }
        return valid;
      });
    }
    batch.movies.push(clean);
  }
  // Conservative until scoped refresh (#5): malformed relationships/records cannot withdraw any source support.
  if (diagnostics.some(item => item.code === 'invalid-record')) batch.complete = false;
  return { batch, source, diagnostics };
}
