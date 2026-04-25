import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://ovberlin.site';
const distDir = path.join(__dirname, '../dist');

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const baseHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const moviesData = JSON.parse(fs.readFileSync(path.join(distDir, 'movies.json'), 'utf-8'));

let count = 0;
for (const movie of moviesData.movies) {
  const slug = toSlug(movie.title);
  const displayTitle: string = movie.tmdbTitle || movie.title;
  const cinemaCount: number = movie.cinemas?.length ?? 0;
  const title = `${displayTitle} — OV Berlin`;
  const description = `${displayTitle} playing at ${cinemaCount} Berlin cinema${cinemaCount !== 1 ? 's' : ''} in original version (OV).`;
  const url = `${BASE_URL}/movie/${slug}`;
  const image: string | null = movie.backdropUrl || movie.posterUrl || null;
  const imageWidth = movie.backdropUrl ? '1280' : '500';
  const imageHeight = movie.backdropUrl ? '720' : '750';

  const imageTags = image
    ? `\n    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:width" content="${imageWidth}" />
    <meta property="og:image:height" content="${imageHeight}" />
    <meta name="twitter:image" content="${esc(image)}" />`
    : '';

  const ogBlock = `<title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${esc(url)}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="OV Berlin" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />${imageTags}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />`;

  const html = baseHtml.replace(
    /<title>OV Berlin[\s\S]*?<meta property="og:url"[^>]*\/>/,
    ogBlock
  );

  const outDir = path.join(distDir, 'movie', slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  count++;
}

console.log(`[og-pages] Generated ${count} movie pages`);
