import 'dotenv/config';
import { scrapeCriticDe } from './scrape-critic-de';
import { scrapeBerlinDe } from './scrape-berlin-de';
import { merge } from './merge';

async function main() {
  const forceEnrich = process.argv.includes('--force-enrich');
  const skipBerlinDe = process.argv.includes('--skip-berlin-de');

  console.log('Starting scrape...');

  await Promise.all([
    scrapeCriticDe(),
    skipBerlinDe
      ? Promise.resolve().then(() => console.log('berlin.de: skipped'))
      : scrapeBerlinDe(),
  ]);

  await merge({ forceEnrich, skipBerlinDe });
}

main().catch(err => { console.error('Scrape failed:', err); process.exit(1); });
