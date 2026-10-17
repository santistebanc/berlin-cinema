import 'dotenv/config';
import { randomUUID } from 'crypto';
import { merge } from './merge';
import { recordAuditFailure, sanitizeAudit } from '../api/audit-log';
import { PipelineStore } from '../api/pipeline/store';
import { configuredRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';
import type { SourceRegistry } from '../api/sources/registry';
import type { SourceDependencies } from '../api/sources/types';
import type { AuditSource } from '../src/types/audit';
import { collectionDiagnostics, failureDiagnostic, PipelineRunFailure, publicationResult, runDiagnostics } from '../api/pipeline/outcomes';
import type { PublicationResult } from '../shared/contracts';

export interface ScrapeOptions { forceEnrich?: boolean; skipBerlinDe?: boolean; publish?: boolean;
  registry?: SourceRegistry; dependencies?: SourceDependencies; selected?: string[]; store?: PipelineStore }
const defaultServices = { merge, recordFailure: recordAuditFailure };

export async function scrape(options: ScrapeOptions = {}, services: { merge: (options: Parameters<typeof merge>[0]) => Promise<PublicationResult | void>;
  recordFailure: typeof recordAuditFailure } = defaultServices): Promise<PublicationResult> {
  const { forceEnrich = false, skipBerlinDe = false, publish = true } = options;
  const registry = (options.registry ?? configuredRegistry()).withSelection({ selected: options.selected,
    disabled: skipBerlinDe ? ['berlin.de'] : [] });
  const store = options.store ?? (options.dependencies ? undefined : new PipelineStore());
  const owner = randomUUID();
  let sources: AuditSource[] = [];
  let operation: 'acquisition' | 'replay' = options.dependencies?.network === false ? 'replay' : 'acquisition';
  try {
    if (store && !store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
    const deps = options.dependencies ?? retainedDependencies(store!, registry);
    operation = deps.network === false ? 'replay' : 'acquisition';
    const collections = await registry.collect({ ...deps, force: forceEnrich },
      { selected: options.selected, disabled: skipBerlinDe ? ['berlin.de'] : [] });
    sources = collections.map(collection => ({ name: collection.sourceInstanceId, status: collection.status, message: collection.message }));
    if (store) {
      store.transaction(() => { for (const collection of collections) store.saveResource(`source-attempt:${collection.sourceInstanceId}`,
        sanitizeAudit({ status: collection.status, diagnostics: collection.diagnostics, message: collection.message }), deps.now()); });
    }
    if (operation === 'acquisition' && !collections.some(collection => collection.status === 'fresh')) {
      const message = 'No source returned fresh usable listings; keeping the published dataset unchanged.';
      throw new PipelineRunFailure(message, { schemaVersion: 1, outcome: 'preserved-acquisition-failure', snapshot: store?.snapshot() ?? null,
        diagnostics: [...collectionDiagnostics(collections), failureDiagnostic('collection', 'total-acquisition-failure', message,
          'Previous publication remains available within its original freshness limits.', true)] });
    }
    store?.releaseLease(owner);
    const result = await services.merge({ forceEnrich, publish, collections, registry, dependencies: options.dependencies, operation });
    return result || publicationResult(null, collections);
  } catch (error) {
    const result: PublicationResult = error instanceof PipelineRunFailure ? error.result : { schemaVersion: 1, outcome: 'fatal',
      snapshot: store?.snapshot() ?? null, diagnostics: [failureDiagnostic('collection', 'acquisition-operation-failed', (error as Error).message,
        'Previous publication is preserved; repair the operation and retry.')] };
    result.diagnostics = runDiagnostics(result.diagnostics);
    if (store && store.acquireLease(owner)) {
      try { store.transaction(() => store.saveResource('pipeline:last-outcome',
        { outcome: result.outcome, diagnostics: result.diagnostics, operation }, options.dependencies?.now())); }
      finally { store.releaseLease(owner); }
    }
    try { services.recordFailure(sanitizeAudit(sources), sanitizeAudit((error as Error).message)); }
    catch (auditError) { console.error('Could not record failed refresh:', (auditError as Error).message); }
    throw new PipelineRunFailure(sanitizeAudit((error as Error).message), result);
  } finally { store?.close(); }
}

export function publishesInMode(mode = process.env.PIPELINE_MODE || 'live'): boolean {
  if (mode !== 'live' && mode !== 'shadow') throw new Error(`Unsupported PIPELINE_MODE: ${mode}. Use live or shadow.`);
  return mode === 'live';
}
if (require.main === module) Promise.resolve().then(() => scrape({ forceEnrich: process.argv.includes('--force-enrich'),
  skipBerlinDe: process.argv.includes('--skip-berlin-de'), publish: publishesInMode(),
  selected: process.argv.find(arg => arg.startsWith('--sources='))?.slice('--sources='.length).split(','),
})).catch(error => { console.error('Scrape failed:', sanitizeAudit((error as Error).message));
  if (error instanceof PipelineRunFailure) console.error(JSON.stringify(error.result)); process.exitCode = 1; });
