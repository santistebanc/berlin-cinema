import BerlinCinemaScraper from '../api/berlin-cinema-scraper';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://ovberlin.site';

function writeSitemap(movieTitles: string[]) {
  const today = new Date().toISOString().split('T')[0];
  const movieUrls = movieTitles.map(title => {
    const slug = encodeURIComponent(title);
    return `
  <url>
    <loc>${BASE_URL}/movie/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${movieUrls}
</urlset>`;

  const outPath = path.join(__dirname, '../public/sitemap.xml');
  fs.writeFileSync(outPath, xml);
  console.log(`Written ${outPath} — ${movieTitles.length + 1} URLs`);
}

async function main() {
  console.log('Starting scrape...');
  const scraper = new BerlinCinemaScraper();
  const data = await scraper.scrapeMovies();

  fs.writeFileSync(path.join(__dirname, '../public/movies.json'), JSON.stringify(data));
  console.log(`Written movies.json — ${data.total} movies`);

  writeSitemap(data.movies.map((m: any) => m.title));
}

main().catch(err => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
