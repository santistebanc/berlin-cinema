import 'dotenv/config';
import { randomUUID } from 'crypto';
import { merge } from './merge';
import { recordAuditFailure } from '../api/audit-log';
import { PipelineStore } from '../api/pipeline/store';
import { configuredRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';
import type { SourceRegistry } from '../api/sources/registry';
import type { SourceDependencies } from '../api/sources/types';
import type { AuditSource } from '../src/types/audit';

export interface ScrapeOptions { forceEnrich?: boolean; skipBerlinDe?: boolean; publish?: boolean;
  registry?: SourceRegistry; dependencies?: SourceDependencies; selected?: string[] }
const defaultServices = { merge, recordFailure: recordAuditFailure };

export async function scrape(options: ScrapeOptions = {}, services = defaultServices): Promise<void> {
  const { forceEnrich = false, skipBerlinDe = false, publish = true } = options;
  const registry = (options.registry ?? configuredRegistry()).withSelection({ selected: options.selected,
    disabled: skipBerlinDe ? ['berlin.de'] : [] });
  const store = options.dependencies ? undefined : new PipelineStore();
  const owner = randomUUID();
  let sources: AuditSource[] = [];
  try {
    if (store && !store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
    const deps = options.dependencies ?? retainedDependencies(store!, registry);
    const collections = await registry.collect({ ...deps, force: forceEnrich },
      { selected: options.selected, disabled: skipBerlinDe ? ['berlin.de'] : [] });
    sources = collections.map(collection => ({ name: collection.sourceInstanceId, status: collection.status, message: collection.message }));
    if (store) {
      store.transaction(() => { for (const collection of collections) store.saveResource(`source-attempt:${collection.sourceInstanceId}`,
        { status: collection.status, diagnostics: collection.diagnostics, message: collection.message }, deps.now()); });
      store.releaseLease(owner);
    }
    if (!collections.some(collection => collection.status === 'fresh'))
      throw new Error('No source returned fresh usable listings; keeping the published dataset unchanged.');
    await services.merge({ forceEnrich, skipBerlinDe, sources, publish, collections, registry, dependencies: options.dependencies });
  } catch (error) {
    try { services.recordFailure(sources, (error as Error).message); }
    catch (auditError) { console.error('Could not record failed refresh:', (auditError as Error).message); }
    throw error;
  } finally { store?.close(); }
}

export function publishesInMode(mode = process.env.PIPELINE_MODE || 'live'): boolean {
  if (mode !== 'live' && mode !== 'shadow') throw new Error(`Unsupported PIPELINE_MODE: ${mode}. Use live or shadow.`);
  return mode === 'live';
}
if (require.main === module) Promise.resolve().then(() => scrape({ forceEnrich: process.argv.includes('--force-enrich'),
  skipBerlinDe: process.argv.includes('--skip-berlin-de'), publish: publishesInMode(),
  selected: process.argv.find(arg => arg.startsWith('--sources='))?.slice('--sources='.length).split(','),
})).catch(error => { console.error('Scrape failed:', (error as Error).message); process.exitCode = 1; });
