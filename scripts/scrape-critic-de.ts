import BerlinCinemaScraper from '../api/berlin-cinema-scraper';
import fs from 'fs';
import path from 'path';
import { PipelineStore } from '../api/pipeline/store';
import { fillSourceDetails } from '../api/pipeline/source-details';

const OUTPUT = path.join(__dirname, '../data/critic-raw.json');

export async function scrapeCriticDe(): Promise<void> {
  const scraper = new BerlinCinemaScraper();
  const raw = await scraper.scrapeRawMovies();
  if (!raw.length || !raw.some(movie => movie.showings?.length)) throw new Error('critic.de returned no usable listings; source completeness is unknown');
  const store = new PipelineStore();
  try { await fillSourceDetails(raw, store); } finally { store.close(); }
  console.log(`critic.de: ${raw.length} raw entries`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ movies: raw, scrapedAt: new Date().toISOString(), complete: true }));
  console.log(`Written ${OUTPUT}`);
}

if (require.main === module) {
  scrapeCriticDe().catch(err => { console.error(err); process.exit(1); });
}
