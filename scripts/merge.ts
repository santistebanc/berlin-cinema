import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PipelineStore } from '../api/pipeline/store';
import { runPipelineResult } from '../api/pipeline/pipeline';
import { PipelineRunFailure } from '../api/pipeline/outcomes';
import type { PublicationResult, SourceCollection } from '../shared/contracts';
import { configuredRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';
import type { SourceRegistry } from '../api/sources/registry';
import type { SourceDependencies } from '../api/sources/types';

export interface MergeOptions { forceEnrich?: boolean; audit?: boolean; publish?: boolean; network?: boolean; collections?: SourceCollection[]; registry?: SourceRegistry; dependencies?: SourceDependencies; now?: string;
  operation?: 'acquisition' | 'replay' | 'recalculate' }
export async function merge(opts: MergeOptions = {}): Promise<PublicationResult> {
  const registry = opts.registry ?? configuredRegistry();
  const publicationRoot = process.env.PIPELINE_PUBLIC_ROOT ?? path.join(__dirname, '..');
  const file = path.join(publicationRoot, 'public/movies.json');
  const legacy = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const store = new PipelineStore();
  try {
    const dependencies = opts.dependencies ?? retainedDependencies(store, registry, { network: opts.network, now: opts.now });
    const collections = opts.collections ?? await registry.collect(dependencies, { retained: true });
    const result = await runPipelineResult({ store, collections, sourceRegistry: registry, sourceDependencies: dependencies, legacy, force: opts.forceEnrich, audit: opts.audit, publish: opts.publish, network: opts.network,
      now: opts.now, publicationRoot, operation: opts.operation ?? (opts.collections ? 'acquisition' : 'replay') });
    if (result.outcome === 'fatal' || result.outcome === 'preserved-acquisition-failure') throw new PipelineRunFailure(result.diagnostics.at(-1)?.reason ?? 'Pipeline failed', result);
    const data = result.snapshot as any;
    console.log(`${opts.publish === false ? 'Shadow processed' : 'Published'} ${data.total} films/programmes; ${data.review.open} issues need local review.`);
    console.log(JSON.stringify({ outcome: result.outcome, diagnostics: result.diagnostics }));
    return result;
  } finally { store.close(); }
}
if (require.main === module) merge({ forceEnrich: process.argv.includes('--force-enrich'), registry: configuredRegistry().withSelection({ disabled: process.argv.includes('--skip-berlin-de') ? ['berlin.de'] : [] }),
  now: process.argv.includes('--now') ? process.argv[process.argv.indexOf('--now') + 1] : undefined,
  network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow') }).catch(error => { console.error((error as Error).message);
    if (error instanceof PipelineRunFailure) console.error(JSON.stringify(error.result)); process.exitCode = 1; });
