import BerlinDeScraper from '../api/berlin-de-scraper';
import fs from 'fs';
import path from 'path';

const OUTPUT = path.join(__dirname, '../data/berlin-raw.json');

export async function scrapeBerlinDe(): Promise<void> {
  const scraper = new BerlinDeScraper();
  const raw = await scraper.scrapeRawMovies();
  console.log(`berlin.de: ${raw.length} movies`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ movies: raw, scrapedAt: new Date().toISOString() }));
  console.log(`Written ${OUTPUT}`);
}

if (require.main === module) {
  scrapeBerlinDe().catch(err => { console.error(err); process.exit(1); });
}
