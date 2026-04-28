import BerlinCinemaScraper from '../api/berlin-cinema-scraper';
import fs from 'fs';
import path from 'path';

const OUTPUT = path.join(__dirname, '../data/critic-raw.json');

export async function scrapeCriticDe(): Promise<void> {
  const scraper = new BerlinCinemaScraper();
  const raw = await scraper.scrapeRawMovies();
  console.log(`critic.de: ${raw.length} raw entries`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ movies: raw, scrapedAt: new Date().toISOString() }));
  console.log(`Written ${OUTPUT}`);
}

if (require.main === module) {
  scrapeCriticDe().catch(err => { console.error(err); process.exit(1); });
}
