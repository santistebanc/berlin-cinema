import BerlinDeScraper from '../api/berlin-de-scraper';
import fs from 'fs';
import path from 'path';
import { PipelineStore } from '../api/pipeline/store';
import { fillSourceDetails } from '../api/pipeline/source-details';
import { fillVenueDetails } from '../api/pipeline/source-venues';

const OUTPUT = path.join(__dirname, '../data/berlin-raw.json');

export async function scrapeBerlinDe(): Promise<void> {
  const scraper = new BerlinDeScraper();
  const raw = await scraper.scrapeRawMovies();
  if (!raw.length || !raw.some(movie => movie.showings?.length)) throw new Error('berlin.de returned no usable listings; source completeness is unknown');
  const store = new PipelineStore();
  try { await fillVenueDetails(raw, store); await fillSourceDetails(raw, store); } finally { store.close(); }
  console.log(`berlin.de: ${raw.length} movies`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ movies: raw, scrapedAt: new Date().toISOString(), complete: true }));
  console.log(`Written ${OUTPUT}`);
}

if (require.main === module) {
  scrapeBerlinDe().catch(err => { console.error(err); process.exit(1); });
}
