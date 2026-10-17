import { randomUUID } from 'crypto';
import { PipelineStore } from '../api/pipeline/store';
import { configuredRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';

/** Compatibility commands acquire one registered source without publishing. */
export async function collectSource(id: string): Promise<void> {
  const registry = configuredRegistry(); const store = new PipelineStore(); const owner = randomUUID();
  try {
    if (!store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
    const collections = await registry.collect(retainedDependencies(store, registry), { selected: [id] });
    store.flush();
    const result = collections.find(collection => collection.sourceInstanceId === id);
    if (result?.status !== 'fresh') throw new Error(result?.message ?? `${id} is disabled or not configured`);
    console.log(`${id}: ${result.records.filter(record => record.kind === 'listing').length} entries`);
  } finally { store.close(); }
}
