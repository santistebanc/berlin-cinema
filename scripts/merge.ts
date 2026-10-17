import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';
import type { SourceCollection } from '../shared/contracts';
import { configuredRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';
import type { SourceRegistry } from '../api/sources/registry';
import type { SourceDependencies } from '../api/sources/types';
import type { AuditSource } from '../src/types/audit';

export interface MergeOptions { forceEnrich?: boolean; skipBerlinDe?: boolean; sources?: AuditSource[]; audit?: boolean; publish?: boolean; network?: boolean; collections?: SourceCollection[]; registry?: SourceRegistry; dependencies?: SourceDependencies }
export async function merge(opts: MergeOptions = {}): Promise<void> {
  const registry = (opts.registry ?? configuredRegistry()).withSelection({ disabled: opts.skipBerlinDe ? ['berlin.de'] : [] });
  const file = path.join(__dirname, '../public/movies.json');
  const legacy = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const store = new PipelineStore();
  try {
    const dependencies = opts.dependencies ?? retainedDependencies(store, registry, { network: opts.network });
    const collections = opts.collections ?? await registry.collect(dependencies, { retained: true, disabled: opts.skipBerlinDe ? ['berlin.de'] : [] });
    const data = await runPipeline({ store, collections, sourceRegistry: registry, sourceDependencies: dependencies, legacy, force: opts.forceEnrich, audit: opts.audit, publish: opts.publish, network: opts.network });
    console.log(`${opts.publish === false ? 'Shadow processed' : 'Published'} ${data.total} films/programmes; ${data.review.open} issues need local review.`);
  } finally { store.close(); }
}
if (require.main === module) merge({ forceEnrich: process.argv.includes('--force-enrich'), skipBerlinDe: process.argv.includes('--skip-berlin-de'),
  network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow') }).catch(error => { console.error((error as Error).message); process.exitCode = 1; });
