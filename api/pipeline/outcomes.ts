import { DiagnosticSchema, type Diagnostic, type PublicationResult, type SourceCollection } from '../../shared/contracts';
import { sanitizeAudit } from '../audit-log';
import { fingerprint } from './domain';

export class PipelineRunFailure extends Error {
  constructor(message: string, readonly result: PublicationResult) { super(sanitizeAudit(message)); this.name = 'PipelineRunFailure'; }
}
export function failureDiagnostic(stage: string, code: string, reason: string, fallback: string, retryable = false): Diagnostic {
  return sanitizeAudit({ schemaVersion: 1, category: 'recovery', stage, code, sourceInstanceId: 'pipeline', reason, retryable, fallback });
}
export function collectionDiagnostics(collections: SourceCollection[]): Diagnostic[] {
  return collections.flatMap(collection => collection.diagnostics).flatMap(raw => {
    const parsed = DiagnosticSchema.safeParse(sanitizeAudit(raw));
    return parsed.success ? [{ ...parsed.data, fallback: parsed.data.fallback ?? 'Retain eligible evidence and valid sibling records.' }] : [];
  });
}
export function runDiagnostics(values: Diagnostic[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = sanitizeAudit(values).map((item: Diagnostic) => ({ ...item,
    fallback: item.fallback ?? 'Retain eligible evidence and valid sibling records.' }));
  return [...new Map(diagnostics.map(item => [fingerprint(item), item])).values()];
}
export function publicationResult(snapshot: any, collections: SourceCollection[], extra: Diagnostic[] = []): PublicationResult {
  const diagnostics = [...collectionDiagnostics(collections), ...(snapshot?.ingestion ?? []).flatMap(item => item.diagnostics ?? []), ...extra];
  const degraded = diagnostics.length > 0 || collections.some(collection => !['fresh', 'skipped'].includes(collection.status)
    || collection.status === 'fresh' && collection.coverage.some(scope => scope.status !== 'complete'))
    || snapshot?.ingestion?.some(item => item.status !== 'accepted' || !item.safeForWithdrawal);
  return { schemaVersion: 1, outcome: degraded ? 'degraded' : 'published', snapshot,
    diagnostics: runDiagnostics(diagnostics) };
}
