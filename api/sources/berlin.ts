import * as cheerio from 'cheerio';
import { mergeBerlinPage, BerlinDeRawMovie } from './berlin-listings';
import { parseVenueAddress } from '../pipeline/addresses';
import { parseFilmMetadata } from './film-metadata';
import { parseBerlinVenue } from './berlin-venue';
import { legacyCollection, replayLegacy } from './legacy';
import type { SourceAdapter } from './types';

const listing = 'https://www.berlin.de/kino/_bin/trefferliste.php';
const film = (url: URL) => url.hostname === 'www.berlin.de' && url.pathname.startsWith('/kino/_bin/filmdetail.php/');
const venue = (url: URL) => url.hostname === 'www.berlin.de' && /^\/kino\/_bin\/kinodetail\.php\/\d+$/.test(url.pathname);
export const berlinAdapter: SourceAdapter = {
  id: 'berlin.de', extractionVersion: 'berlin-v1', capabilities: ['screenings', 'film-details', 'venue-details'],
  allows: (url, purpose) => purpose === 'film' ? film(url) : purpose === 'venue' ? venue(url) : url.origin + url.pathname === listing,
  film: { accepts: film, extract: html => { const fields = parseFilmMetadata(html); return { fields, creditsChecked: Object.keys(fields).length > 0 }; } },
  venue: { accepts: venue, extract: parseBerlinVenue, needsLookup: cinema => { const address = parseVenueAddress(cinema.address); return !address?.postalCode || !address.city; }, cacheUsable: () => true },
  replay: replayLegacy,
  async collect(instance, deps) {
    const movies = new Map<string, BerlinDeRawMovie>();
    let complete = true;
    const diagnostics = [];
    for (let page = 0; page < 20; page++) {
      const url = `${listing}?ovomu=on&suche=1${page ? `&startat=${page * 300}` : ''}`;
      try {
        let response;
        for (let attempt = 0; ; attempt++) {
          try { response = await deps.request({ url, headers: {
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          } }); break; }
          catch (error: any) {
            if (attempt >= 3 || ![425, 429].includes(error.response?.status)) throw error;
            const seconds = Number.parseInt(error.response?.headers?.['retry-after'] ?? '5', 10);
            await deps.wait?.(Math.min(60000, Math.max(0, Number.isFinite(seconds) ? seconds + 1 : 6) * 1000));
          }
        }
        const $ = cheerio.load(response.body);
        if (!$('ul.js-accordion').length) throw new Error('Unsupported berlin.de listing page structure');
        if (!$('ul.js-accordion > li').length) break;
        const pageMovies = new Map<string, BerlinDeRawMovie>();
        mergeBerlinPage(response.body, pageMovies);
        if (![...pageMovies.values()].some(movie => movie.showings.length)) throw new Error('The berlin.de page contained entries but no supported screenings');
        const before = [...movies.values()].reduce((sum, movie) => sum + movie.showings.length, 0);
        mergeBerlinPage(response.body, movies);
        if ([...movies.values()].reduce((sum, movie) => sum + movie.showings.length, 0) === before) break;
        if (page === 19) throw new Error('berlin.de pagination limit reached; source is incomplete');
      } catch (error) {
        complete = false;
        diagnostics.push({ schemaVersion: 1 as const, category: 'recovery' as const, stage: 'collection', code: 'page-failed',
          sourceInstanceId: instance.id, reason: (error as Error).message, retryable: true, evidence: { url, page: page + 1 } });
        break;
      }
    }
    if (!movies.size && diagnostics.length) throw new Error(diagnostics[0].reason);
    const collection = await legacyCollection([...movies.values()].filter(movie => movie.showings.length), complete, instance, berlinAdapter, deps);
    collection.diagnostics.push(...diagnostics);
    return collection;
  },
};
