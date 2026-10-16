import 'dotenv/config';
import { scrapeCriticDe } from './scrape-critic-de';
import { scrapeBerlinDe } from './scrape-berlin-de';
import { merge } from './merge';
import { recordAuditFailure } from '../api/audit-log';
import type { AuditSource } from '../src/types/audit';

interface ScrapeOptions { forceEnrich?: boolean; skipBerlinDe?: boolean; publish?: boolean }
const defaultServices = { critic: scrapeCriticDe, berlin: scrapeBerlinDe, merge, recordFailure: recordAuditFailure };

export async function scrape(options: ScrapeOptions = {}, services = defaultServices): Promise<void> {
  const { forceEnrich = false, skipBerlinDe = false, publish = true } = options;
  const sources: AuditSource[] = [
    { name: 'critic.de', status: 'failed', message: 'Not completed' },
    { name: 'berlin.de', status: 'failed', message: 'Not completed' },
  ];

  console.log('Starting scrape...');

  try {
    await Promise.all([
      services.critic().then(() => { sources[0] = { name: 'critic.de', status: 'fresh' }; }).catch(err => {
        sources[0] = { name: 'critic.de', status: 'failed', message: `Fresh extraction failed: ${(err as Error).message}` };
        console.warn(`critic.de: scrape failed: ${(err as Error).message}`);
      }),
      skipBerlinDe
        ? Promise.resolve().then(() => { sources[1] = { name: 'berlin.de', status: 'skipped' }; console.log('berlin.de: skipped'); })
        : services.berlin().then(() => { sources[1] = { name: 'berlin.de', status: 'fresh' }; }).catch(err => {
          sources[1] = { name: 'berlin.de', status: 'cached', message: `Fresh extraction failed: ${(err as Error).message}` };
          console.warn(`berlin.de: scrape failed, continuing with cached raw data: ${(err as Error).message}`);
        }),
    ]);

    if (!sources.some(source => source.status === 'fresh')) {
      throw new Error('No source returned fresh usable listings; keeping the published dataset unchanged.');
    }
    await services.merge({ forceEnrich, skipBerlinDe, sources, publish });
  } catch (error) {
    try { services.recordFailure(sources, (error as Error).message); }
    catch (auditError) { console.error('Could not record failed refresh:', (auditError as Error).message); }
    throw error;
  }
}

export function publishesInMode(mode = process.env.PIPELINE_MODE || 'live'): boolean {
  if (mode !== 'live' && mode !== 'shadow') throw new Error(`Unsupported PIPELINE_MODE: ${mode}. Use live or shadow.`);
  return mode === 'live';
}

if (require.main === module) Promise.resolve().then(() => scrape({
  forceEnrich: process.argv.includes('--force-enrich'), skipBerlinDe: process.argv.includes('--skip-berlin-de'), publish: publishesInMode(),
})).catch(err => {
  console.error('Scrape failed:', (err as Error).message); process.exit(1);
});
