import 'dotenv/config';
import MovieMerger, { setExtraCinemaAliases } from '../api/movie-merger';
import TmdbClient from '../api/tmdb-client';
import { fetchBerlinCinemaWebsites, matchCinemaWebsite, resolveNewCinemasViaOsm } from '../api/osm-client';
import { fetchOmdbData } from '../api/omdb-client';
import {
  collectCinemaCandidates,
  EntityResolver,
  logResolverStatus,
  mergeMovieRecords,
} from '../api/entity-resolver';
import { tokenSetRatio } from '../api/fuzzy-match';
import { Movie } from '../src/types';
import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const tmdb = TMDB_API_KEY ? new TmdbClient(TMDB_API_KEY) : null;

const CRITIC_RAW = path.join(__dirname, '../data/critic-raw.json');
const BERLIN_RAW = path.join(__dirname, '../data/berlin-raw.json');
const MOVIES_JSON = path.join(__dirname, '../public/movies.json');
const BASE_URL = 'https://ovberlin.site';

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

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
  if (!fs.existsSync(MOVIES_JSON)) return new Map();
  try {
    const existing = JSON.parse(fs.readFileSync(MOVIES_JSON, 'utf-8'));
    const map = new Map<string, Movie>();
    for (const movie of (existing.movies || []) as Movie[]) {
      map.set(movie.title.toLowerCase(), movie);
    }
    return map;
  } catch {
    return new Map();
  }
}

function initTmdbFields(movie: Movie) {
  movie.originalTitle = null;
  movie.alternativeTitles = [];
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
  to.originalTitle = from.originalTitle;
  to.alternativeTitles = from.alternativeTitles;
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

function canReuseTmdbCache(movie: Movie, cached: Movie): boolean {
  if (!cached.tmdbFetched) return false;

  if (movie.year && cached.year && Math.abs(movie.year - cached.year) > 1) {
    return false;
  }

  if (movie.director && cached.director && tokenSetRatio(movie.director, cached.director) < 0.65) {
    return false;
  }

  return true;
}

export interface MergeOptions {
  forceEnrich?: boolean;
  skipBerlinDe?: boolean;
}

export async function merge(opts: MergeOptions = {}): Promise<void> {
  const { forceEnrich = false, skipBerlinDe = false } = opts;

  const criticData = JSON.parse(fs.readFileSync(CRITIC_RAW, 'utf-8'));
  const berlinData = skipBerlinDe || !fs.existsSync(BERLIN_RAW)
    ? { movies: [] }
    : JSON.parse(fs.readFileSync(BERLIN_RAW, 'utf-8'));

  const allRaw = [...criticData.movies, ...berlinData.movies];

  const entitiesPath = path.join(__dirname, '../api/entities.json');
  const resolver = new EntityResolver({ entitiesPath });
  await logResolverStatus();

  const cinemaCandidates = collectCinemaCandidates(allRaw);
  await resolver.resolveCinemas(cinemaCandidates);

  const stillUnknown = cinemaCandidates
    .filter(c => resolver.resolveCinemaSync(c.name) === c.name)
    .map(c => c.name);
  if (stillUnknown.length > 0) {
    console.log(`[resolver] ${stillUnknown.length} cinema(s) still unknown — trying OSM address match`);
    const osmDiscovered = await resolveNewCinemasViaOsm(
      stillUnknown,
      resolver.getKnownCanonicals(),
      entitiesPath,
      false,
    );
    for (const { alias, canonical } of osmDiscovered) {
      resolver.registerOsmAlias(alias, canonical);
    }
  }

  setExtraCinemaAliases(resolver.getDiscoveredAliases());

  const { movies: mergedMovies, newCinemas } = MovieMerger.mergeMovies(allRaw);
  console.log(`Merged: ${mergedMovies.length} unique movies`);

  if (newCinemas.length > 0) {
    console.log(`[entities] ${newCinemas.length} unresolved cinema(s): ${newCinemas.join(', ')}`);
  }

  const data = { movies: mergedMovies, total: mergedMovies.length, scrapedAt: new Date().toISOString() };

  // "OF" ("Originalfassung") means the same thing as "OV" — normalize regardless
  // of TMDb enrichment/language, and regardless of stale raw scrape caches.
  for (const movie of data.movies) {
    movie.variants = [...new Set(movie.variants.map((v: string) => v === 'OF' ? 'OV' : v))];
    for (const times of Object.values(movie.showings as Record<string, Record<string, any[]>>)) {
      for (const [time, entries] of Object.entries(times)) {
        for (const entry of entries) {
          if (entry.variants) entry.variants = entry.variants.map((v: string) => v === 'OF' ? 'OV' : v);
        }
        const seen = new Set<string>();
        times[time] = entries.filter((entry: any) => {
          const key = entry.cinema + '|' + (entry.variants ?? []).slice().sort().join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  }

  const existingMovies = tmdb ? loadExistingMovies() : new Map();

  if (tmdb) {
    console.log(`Enriching ${data.movies.length} movies with TMDb data${forceEnrich ? ' (force re-enrich)' : ''}...`);
    let cacheHits = 0, enrichedCount = 0, skippedCount = 0;

    for (const movie of data.movies) {
      initTmdbFields(movie);
      const isSpecial = (movie.url ? !movie.url.includes('/movie/') && !movie.url.includes('filmdetail.php') : false)
        || /sneak|kurzfilm|festival|sonderprogramm|filmreihe|sondervorstellung/i.test(movie.title);
      if (isSpecial) { movie.tmdbFetched = true; continue; }

      const oldMovie = existingMovies.get(movie.title.toLowerCase());
      if (!forceEnrich && oldMovie && canReuseTmdbCache(movie, oldMovie)) {
        copyTmdbFields(oldMovie, movie);
        cacheHits++;
        continue;
      }

      const tmdbData = await tmdb.enrichMovie(movie.title, movie.altTitle, {
        year: movie.year,
        director: movie.director,
      });
      if (tmdbData) {
        enrichedCount++;
        movie.originalTitle = tmdbData.originalTitle;
        movie.alternativeTitles = tmdbData.alternativeTitles;
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
        movie.tmdbFetched = tmdbData === null;
      }
    }
    console.log(`Cache hits: ${cacheHits} | Newly enriched: ${enrichedCount} | No match: ${skippedCount}`);

    // Convert OmU to OmeU for German language movies from critic.de
    for (const movie of data.movies) {
      if (movie.originalLanguage !== 'de') continue;
      if (!movie.url?.includes('/movie/')) continue;
      
      // Convert movie-level variants and deduplicate
      movie.variants = [...new Set(movie.variants.map((v: string) => v === 'OmU' ? 'OmeU' : v))];
      
      // Convert showing-level variants and deduplicate
      for (const [date, times] of Object.entries(movie.showings as Record<string, Record<string, any[]>>)) {
        for (const [time, entries] of Object.entries(times)) {
          // First, convert OmU to OmeU in all entries
          for (const entry of entries) {
            if (entry.variants) {
              entry.variants = entry.variants.map((v: string) => v === 'OmU' ? 'OmeU' : v);
            }
          }
          // Then deduplicate: keep only unique cinema+variants combinations
          const seen = new Set<string>();
          const deduped: any[] = [];
          for (const entry of entries) {
            const key = entry.cinema + '|' + (entry.variants ?? []).slice().sort().join('|');
            if (!seen.has(key)) {
              seen.add(key);
              deduped.push(entry);
            }
          }
          (movie.showings as any)[date][time] = deduped;
        }
      }
    }

    // Post-TMDb dedup by imdbId
    const imdbGroups = new Map<string, any[]>();
    for (const movie of data.movies) {
      if (movie.imdbId) {
        const group = imdbGroups.get(movie.imdbId) ?? [];
        group.push(movie);
        imdbGroups.set(movie.imdbId, group);
      }
    }
    const toRemove = new Set<any>();
    for (const [, group] of imdbGroups) {
      if (group.length < 2) continue;
      group.sort((a: any, b: any) => Object.keys(b.showings).length - Object.keys(a.showings).length);
      const primary = group[0];
      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        mergeMovieRecords(primary, dup);
        toRemove.add(dup);
        console.log(`[tmdb-dedup] Merged "${dup.title}" → "${primary.title}" (${dup.imdbId})`);
      }
    }
    if (toRemove.size > 0) {
      data.movies = data.movies.filter((m: any) => !toRemove.has(m));
      data.total = data.movies.length;
      console.log(`[tmdb-dedup] Removed ${toRemove.size} duplicate(s), ${data.movies.length} remain`);
    }
  } else {
    console.log('No TMDB_API_KEY — skipping enrichment');
    for (const movie of data.movies) initTmdbFields(movie);
  }

  const fuzzyMerged = await resolver.deduplicateMovies(data.movies);
    if (fuzzyMerged > 0) {
      data.total = data.movies.length;
      console.log(`[resolver] Embedding/fuzzy merged ${fuzzyMerged} movie pair(s), ${data.movies.length} remain`);
    }

  if (OMDB_API_KEY) {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    let omdbFetched = 0, omdbCached = 0, omdbErrors = 0;
    for (const movie of data.movies) {
      const isSpecial = (movie.url ? !movie.url.includes('/movie/') && !movie.url.includes('filmdetail.php') : false)
        || /sneak|kurzfilm|festival|sonderprogramm|filmreihe|sondervorstellung/i.test(movie.title);
      if (!movie.imdbId || isSpecial) continue;
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
      } else {
        omdbErrors++;
      }
    }
    const errSuffix = omdbErrors > 0 ? `, errors: ${omdbErrors}` : '';
    console.log(`OMDb — fetched: ${omdbFetched}, cached: ${omdbCached}${errSuffix}`);
  } else {
    console.log('No OMDB_API_KEY — skipping IMDb ratings');
  }

  // OSM cinema website lookup
  const existingCinemaWebsites = new Map<string, { websiteUrl?: string; osmFetched: boolean }>();
  if (!forceEnrich) {
    for (const movie of existingMovies.values()) {
      for (const cinema of (movie.cinemas ?? [])) {
        if ((cinema as any).osmFetched && !existingCinemaWebsites.has(cinema.name)) {
          existingCinemaWebsites.set(cinema.name, { websiteUrl: (cinema as any).websiteUrl, osmFetched: true });
        }
      }
    }
  }

  const allCinemas = new Set<string>();
  for (const movie of data.movies) {
    for (const cinema of (movie.cinemas ?? [])) {
      if (!existingCinemaWebsites.has(cinema.name)) allCinemas.add(cinema.name);
    }
  }

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

  for (const movie of data.movies) {
    const criticName = movie.title.trim();
    const tmdbName = movie.tmdbTitle?.trim();
    movie.criticTitle = tmdbName && criticName.toLowerCase() !== tmdbName.toLowerCase() ? criticName : null;
  }

  assignSlugs(data.movies);

  resolver.persist();

  fs.writeFileSync(MOVIES_JSON, JSON.stringify(data));
  console.log(`Written ${MOVIES_JSON} — ${data.total} movies`);

  writeSitemap(data.movies);
}

if (require.main === module) {
  const forceEnrich = process.argv.includes('--force-enrich');
  const skipBerlinDe = process.argv.includes('--skip-berlin-de');
  merge({ forceEnrich, skipBerlinDe }).catch(err => { console.error(err); process.exit(1); });
}
