import 'dotenv/config';
import BerlinCinemaScraper from '../api/berlin-cinema-scraper';
import TmdbClient from '../api/tmdb-client';
import { fetchBerlinCinemaWebsites, matchCinemaWebsite } from '../api/osm-client';
import { fetchOmdbData } from '../api/omdb-client';
import { Movie } from '../src/types';
import fs from 'fs';
import path from 'path';

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const tmdb = TMDB_API_KEY ? new TmdbClient(TMDB_API_KEY) : null;

const BASE_URL = 'https://ovberlin.site';
const MOVIES_JSON_PATH = path.join(__dirname, '../public/movies.json');

function assignSlugs(movies: Movie[]) {
  const baseSlugs = movies.map(m => toSlug(m.tmdbTitle || m.title));
  const slugCount = new Map<string, number>();
  for (const s of baseSlugs) slugCount.set(s, (slugCount.get(s) ?? 0) + 1);

  const slugSeen = new Map<string, number>();
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const base = baseSlugs[i];
    let slug = slugCount.get(base)! > 1 && movie.year ? `${base}-${movie.year}` : base;
    if (slugSeen.has(slug)) slug = `${slug}-${slugSeen.get(slug)! + 1}`;
    slugSeen.set(slug, (slugSeen.get(slug) ?? 0) + 1);
    movie.slug = slug;
  }
}

function writeSitemap(movies: Movie[]) {
  const today = new Date().toISOString().split('T')[0];
  const movieUrls = movies.map(m => `
  <url>
    <loc>${BASE_URL}/${m.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

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
  console.log(`Written ${outPath} — ${movies.length + 1} URLs`);
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
  movie.imdbRating = null;
  movie.imdbVotes = null;
  movie.allRatings = null;
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
  to.imdbRating = from.imdbRating;
  to.imdbVotes = from.imdbVotes;
  to.allRatings = from.allRatings;
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

      if ((movie as any).isSpecial) {
        movie.tmdbFetched = true;
        continue;
      }

      const oldMovie = existingMovies.get(movie.title.toLowerCase());

      if (!forceEnrich && oldMovie?.tmdbFetched) {
        copyTmdbFields(oldMovie, movie);
        cacheHits++;
        continue;
      }

      const tmdbData = await tmdb.enrichMovie(movie.title, movie.altTitle);
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
        movie.tmdbFetched = true;
      } else {
        skippedCount++;
        // ✓ TMDB explicitly returned NO MATCH for this title - mark as fetched so we don't try again
        // ✗ For network errors / timeouts / rate limits: enrichMovie returns undefined, so we retry next run
        movie.tmdbFetched = tmdbData === null;
      }
    }
    console.log(`Cache hits: ${cacheHits} | Newly enriched: ${enrichedCount} | No match: ${skippedCount}`);
  } else {
    console.log('No TMDB_API_KEY found — skipping enrichment');
    for (const movie of data.movies) {
      initTmdbFields(movie);
    }
  }

  // Fetch ratings via OMDb; cache for 24h to stay within free tier limits
  if (OMDB_API_KEY) {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    let omdbFetched = 0;
    let omdbCached = 0;
    for (const movie of data.movies) {
      if (!movie.imdbId || (movie as any).isSpecial) continue;
      const cached = existingMovies.get(movie.title.toLowerCase());
      const age = cached?.omdbFetchedAt ? Date.now() - new Date(cached.omdbFetchedAt).getTime() : Infinity;
      if (!forceEnrich && cached?.imdbRating != null && age < ONE_DAY_MS) {
        movie.imdbRating = cached.imdbRating;
        movie.imdbVotes = cached.imdbVotes ?? null;
        movie.allRatings = cached.allRatings ?? null;
        movie.omdbFetchedAt = cached.omdbFetchedAt;
        omdbCached++;
        continue;
      }
      const omdb = await fetchOmdbData(movie.imdbId, OMDB_API_KEY);
      if (omdb) {
        movie.imdbRating = omdb.imdbRating;
        movie.imdbVotes = omdb.imdbVotes;
        movie.allRatings = omdb.ratings.length > 0 ? omdb.ratings : null;
        movie.omdbFetchedAt = new Date().toISOString();
        omdbFetched++;
      }
    }
    console.log(`OMDb — fetched: ${omdbFetched}, cached: ${omdbCached}`);
  } else {
    console.log('No OMDB_API_KEY found — skipping IMDb ratings');
  }

  // Build a map of existing cinema website data for caching (skipped on force)
  const existingCinemaWebsites = new Map<string, { websiteUrl?: string; osmFetched: boolean }>();
  if (!forceEnrich) {
    for (const movie of existingMovies.values()) {
      for (const cinema of (movie.cinemas ?? [])) {
        if ((cinema as any).osmFetched && !existingCinemaWebsites.has(cinema.name)) {
          existingCinemaWebsites.set(cinema.name, {
            websiteUrl: (cinema as any).websiteUrl,
            osmFetched: true,
          });
        }
      }
    }
  }

  // Collect cinema names that still need OSM lookup
  const allCinemas = new Set<string>();
  for (const movie of data.movies) {
    for (const cinema of (movie.cinemas ?? [])) {
      if (!existingCinemaWebsites.has(cinema.name)) allCinemas.add(cinema.name);
    }
  }

  // Fetch from OSM only if there are unresolved cinemas
  let osmMap: Map<string, string> | null = null;
  if (allCinemas.size > 0) {
    console.log(`[osm] Looking up websites for ${allCinemas.size} cinemas${forceEnrich ? ' (forced)' : ''}...`);
    try {
      osmMap = await fetchBerlinCinemaWebsites();
    } catch (e) {
      console.warn('[osm] Failed to fetch from Overpass API:', (e as Error).message);
    }
  } else {
    console.log('[osm] All cinemas already resolved — skipping fetch');
  }

  // Apply website URLs to all cinema objects
  for (const movie of data.movies) {
    for (const cinema of (movie.cinemas ?? [])) {
      const cached = existingCinemaWebsites.get(cinema.name);
      if (cached) {
        (cinema as any).websiteUrl = cached.websiteUrl;
        (cinema as any).osmFetched = true;
      } else if (osmMap) {
        const website = matchCinemaWebsite(cinema.name, osmMap);
        (cinema as any).websiteUrl = website ?? undefined;
        (cinema as any).osmFetched = true;
      }
    }
  }

  // Set criticTitle to the critic.de title when it differs from the TMDb title
  for (const movie of data.movies) {
    const criticName = movie.title.trim();
    const tmdbName = movie.tmdbTitle?.trim();
    movie.criticTitle = tmdbName && criticName.toLowerCase() !== tmdbName.toLowerCase()
      ? criticName
      : null;
  }

  assignSlugs(data.movies);

  fs.writeFileSync(MOVIES_JSON_PATH, JSON.stringify(data));
  console.log(`Written movies.json — ${data.total} movies`);

  writeSitemap(data.movies);
}

main().catch(err => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
