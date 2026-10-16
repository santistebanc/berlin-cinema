import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';
import { SourceBatch } from '../api/pipeline/domain';
import type { AuditSource } from '../src/types/audit';

export interface MergeOptions { forceEnrich?: boolean; skipBerlinDe?: boolean; sources?: AuditSource[]; audit?: boolean; publish?: boolean; network?: boolean }
export async function merge(opts: MergeOptions = {}): Promise<void> {
  const batches: SourceBatch[] = [];
  for (const [source, filename] of [['critic.de', 'critic-raw.json'], ['berlin.de', 'berlin-raw.json']]) {
    const file = path.join(__dirname, '../data', filename);
    const status = opts.sources?.find(item => item.name === source);
    const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    batches.push({ source, movies: raw?.movies ?? [], observedAt: raw?.scrapedAt ?? new Date().toISOString(),
      status: source === 'berlin.de' && opts.skipBerlinDe ? 'skipped' : status?.status === 'fresh' ? 'fresh' : raw ? 'cached' : 'failed',
      complete: status?.status === 'fresh' && raw?.complete !== false, message: status?.message });
  }
  const file = path.join(__dirname, '../public/movies.json');
  const legacy = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const store = new PipelineStore();
  try {
    const data = await runPipeline({ store, batches, legacy, force: opts.forceEnrich, audit: opts.audit, publish: opts.publish, network: opts.network });
    console.log(`${opts.publish === false ? 'Shadow processed' : 'Published'} ${data.total} films/programmes; ${data.review.open} issues need local review.`);
  } finally { store.close(); }
}
if (require.main === module) merge({ forceEnrich: process.argv.includes('--force-enrich'), skipBerlinDe: process.argv.includes('--skip-berlin-de'),
  network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow') }).catch(error => { console.error((error as Error).message); process.exitCode = 1; });
