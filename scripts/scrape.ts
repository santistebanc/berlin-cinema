import BerlinCinemaScraper from '../api/berlin-cinema-scraper';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('Starting scrape...');
  const scraper = new BerlinCinemaScraper();
  const data = await scraper.scrapeMovies();
  const outPath = path.join(__dirname, '../public/movies.json');
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`Written ${outPath} — ${data.total} movies`);
}

main().catch(err => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
