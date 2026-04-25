import express from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import moviesRouter from './movies-express';

const app = express();
const PORT = process.env.PORT || 3003;

const CRAWLER_RE = /WhatsApp|facebookexternalhit|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Discordbot/i;

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ogHtml(title: string, description: string, url: string, image: string | null, imageWidth = '500', imageHeight = '750'): string {
  const img = image
    ? `<meta property="og:image" content="${esc(image)}">
    <meta property="og:image:width" content="${imageWidth}">
    <meta property="og:image:height" content="${imageHeight}">
    <meta name="twitter:image" content="${esc(image)}">`
    : '';
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="OV Berlin">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  ${img}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta http-equiv="refresh" content="0; url=${esc(url)}">
</head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`;
}

app.use(cors());
app.use(express.json());
app.use('/api/movies', moviesRouter);
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/movie/:title', (req, res, next) => {
  const ua = req.headers['user-agent'] ?? '';
  if (!CRAWLER_RE.test(ua)) return next();

  try {
    const moviesFile = path.join(__dirname, 'dist', 'movies.json');
    const data = JSON.parse(fs.readFileSync(moviesFile, 'utf-8'));
    const slug = req.params.title;
    const movie = (data.movies as any[])?.find((m) => toSlug(m.title) === slug);
    if (!movie) return next();

    const displayTitle: string = movie.tmdbTitle || movie.title;
    const cinemaCount: number = movie.cinemas?.length ?? 0;
    const title = `${displayTitle} — OV Berlin`;
    const description = `${displayTitle} playing at ${cinemaCount} Berlin cinema${cinemaCount !== 1 ? 's' : ''} in original version (OV).`;
    const url = `https://ovberlin.site/movie/${toSlug(movie.title)}`;
    const image = movie.backdropUrl || movie.posterUrl || null;
    const imageWidth = movie.backdropUrl ? '1280' : '500';
    const imageHeight = movie.backdropUrl ? '720' : '750';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(ogHtml(title, description, url, image, imageWidth, imageHeight));
  } catch {
    next();
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
});
