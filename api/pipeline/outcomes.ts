import { CollectionEnvelopeSchema, CoverageSchema, DiagnosticSchema, type Diagnostic, type PublicationResult } from '../../shared/contracts';
import { sanitizeAudit } from '../audit-log';
import { fingerprint } from './domain';

export class PipelineRunFailure extends Error {
  constructor(message: string, readonly result: PublicationResult) { super(sanitizeAudit(message)); this.name = 'PipelineRunFailure'; }
}
export function failureDiagnostic(stage: string, code: string, reason: string, fallback: string, retryable = false): Diagnostic {
  return sanitizeAudit({ schemaVersion: 1, category: 'recovery', stage, code, sourceInstanceId: 'pipeline', reason, retryable, fallback });
}
export function collectionDiagnostics(collections: unknown[]): Diagnostic[] {
  return collections.flatMap(input => {
    const envelope = CollectionEnvelopeSchema.safeParse(input);
    return envelope.success ? envelope.data.diagnostics : [];
  }).flatMap(raw => {
    const parsed = DiagnosticSchema.safeParse(sanitizeAudit(raw));
    return parsed.success ? [{ ...parsed.data, fallback: parsed.data.fallback ?? 'Retain eligible evidence and valid sibling records.' }] : [];
  });
}
export function runDiagnostics(values: Diagnostic[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = sanitizeAudit(values).map((item: Diagnostic) => ({ ...item,
    fallback: item.fallback ?? 'Retain eligible evidence and valid sibling records.' }));
  return [...new Map(diagnostics.map(item => [fingerprint(item), item])).values()];
}
export function publicationResult(snapshot: any, collections: unknown[], extra: Diagnostic[] = []): PublicationResult {
  const diagnostics = [...collectionDiagnostics(collections), ...(snapshot?.ingestion ?? []).flatMap(item => item.diagnostics ?? []), ...extra];
  const degraded = diagnostics.length > 0 || collections.some(input => {
    const envelope = CollectionEnvelopeSchema.safeParse(input);
    return !envelope.success || !['fresh', 'skipped'].includes(envelope.data.status)
      || envelope.data.status === 'fresh' && envelope.data.coverage.some(raw => {
        const scope = CoverageSchema.safeParse(raw);
        return !scope.success || scope.data.status !== 'complete';
      });
  })
    || snapshot?.ingestion?.some(item => item.status !== 'accepted' || !item.safeForWithdrawal);
  return { schemaVersion: 1, outcome: degraded ? 'degraded' : 'published', snapshot,
    diagnostics: runDiagnostics(diagnostics) };
}
