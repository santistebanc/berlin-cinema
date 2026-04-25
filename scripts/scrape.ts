import 'dotenv/config';
import BerlinCinemaScraper from '../api/berlin-cinema-scraper';
import TmdbClient from '../api/tmdb-client';
import { Movie } from '../src/types';
import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const tmdb = TMDB_API_KEY ? new TmdbClient(TMDB_API_KEY) : null;

const BASE_URL = 'https://ovberlin.site';
const MOVIES_JSON_PATH = path.join(__dirname, '../public/movies.json');

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

function loadExistingMovies(): Map<string, Movie> {
  if (!fs.existsSync(MOVIES_JSON_PATH)) {
    return new Map();
  }
  try {
    const existing = JSON.parse(fs.readFileSync(MOVIES_JSON_PATH, 'utf-8'));
    const movies: Movie[] = existing.movies || [];
    const map = new Map<string, Movie>();
    for (const movie of movies) {
      map.set(movie.title.toLowerCase(), movie);
    }
    return map;
  } catch {
    return new Map();
  }
}

function initTmdbFields(movie: Movie) {
  movie.tmdbTitle = null;
  movie.tagline = null;
  movie.plot = null;
  movie.runtime = null;
  movie.rating = null;
  movie.voteCount = null;
  movie.genres = null;
  movie.originalLanguage = null;
  movie.trailerUrl = null;
  movie.imdbId = null;
  movie.backdropUrl = null;
  movie.ageRating = null;
  movie.keywords = [];
  movie.tmdbFetched = false;
}

function copyTmdbFields(from: Movie, to: Movie) {
  to.tmdbTitle = from.tmdbTitle;
  to.tagline = from.tagline;
  to.posterUrl = from.posterUrl || to.posterUrl;
  to.plot = from.plot;
  to.runtime = from.runtime;
  to.rating = from.rating;
  to.voteCount = from.voteCount;
  to.genres = from.genres;
  to.year = from.year || to.year;
  to.director = from.director || to.director;
  to.cast = from.cast || to.cast;
  to.originalLanguage = from.originalLanguage;
  to.trailerUrl = from.trailerUrl;
  to.imdbId = from.imdbId;
  to.backdropUrl = from.backdropUrl;
  to.ageRating = from.ageRating;
  to.keywords = from.keywords;
  to.tmdbFetched = true;
}

async function main() {
  const forceEnrich = process.argv.includes('--force-enrich');
  console.log('Starting scrape...');
  const scraper = new BerlinCinemaScraper();
  const data = await scraper.scrapeMovies();

  const existingMovies = tmdb ? loadExistingMovies() : new Map();

  if (tmdb) {
    console.log(`Enriching ${data.movies.length} movies with TMDb data${forceEnrich ? ' (force re-enrich)' : ''}...`);
    let cacheHits = 0;
    let enrichedCount = 0;
    let skippedCount = 0;

    for (const movie of data.movies) {
      initTmdbFields(movie);

      const oldMovie = existingMovies.get(movie.title.toLowerCase());

      if (!forceEnrich && oldMovie?.tmdbFetched) {
        copyTmdbFields(oldMovie, movie);
        cacheHits++;
        continue;
      }

      const tmdbData = await tmdb.enrichMovie(movie.title);
      if (tmdbData) {
        enrichedCount++;
        movie.tmdbTitle = tmdbData.tmdbTitle;
        movie.tagline = tmdbData.tagline;
        movie.posterUrl = tmdbData.posterUrl || movie.posterUrl;
        movie.director = tmdbData.director || movie.director;
        movie.cast = tmdbData.cast || movie.cast;
        movie.year = tmdbData.releaseYear || movie.year;
        movie.plot = tmdbData.plot;
        movie.runtime = tmdbData.runtime;
        movie.rating = tmdbData.rating;
        movie.voteCount = tmdbData.voteCount;
        movie.genres = tmdbData.genres;
        movie.originalLanguage = tmdbData.originalLanguage;
        movie.trailerUrl = tmdbData.trailerUrl;
        movie.imdbId = tmdbData.imdbId;
        movie.backdropUrl = tmdbData.backdropUrl;
        movie.ageRating = tmdbData.ageRating;
        movie.keywords = tmdbData.keywords;
      }
      movie.tmdbFetched = true;
      if (!tmdbData) skippedCount++;
    }
    console.log(`Cache hits: ${cacheHits} | Newly enriched: ${enrichedCount} | No match: ${skippedCount}`);
  } else {
    console.log('No TMDB_API_KEY found — skipping enrichment');
    for (const movie of data.movies) {
      initTmdbFields(movie);
    }
  }

  fs.writeFileSync(MOVIES_JSON_PATH, JSON.stringify(data));
  console.log(`Written movies.json — ${data.total} movies`);

  writeSitemap(data.movies.map((m: any) => m.title));
}

main().catch(err => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
