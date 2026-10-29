import * as cheerio from 'cheerio';
import { mergeBerlinPage, BerlinDeRawMovie } from './berlin-listings';
import { parseVenueAddress } from '../pipeline/addresses';
import { parseFilmMetadata } from './film-metadata';
import { parseBerlinVenue } from './berlin-venue';
import { legacyCollection, listingCollection, replayLegacy } from './legacy';
import { SourcePersistenceError, type SourceAdapter } from './types';

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
    const observedAt = deps.now();
    let complete = true;
    const diagnostics = [];
    for (let page = 0; page < 20; page++) {
      const url = `${listing}?ovomu=on&suche=1${page ? `&startat=${page * 300}` : ''}`;
      try {
        // berlin.de rejects listing requests without the navigation headers a browser sends.
        const response = await deps.request({ url, headers: {
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          } });
        const $ = cheerio.load(response.body);
        if (!$('ul.js-accordion').length) throw new Error('Unsupported berlin.de listing page structure');
        if (!$('ul.js-accordion > li').length) break;
        const pageMovies = new Map<string, BerlinDeRawMovie>();
        const rejected = mergeBerlinPage(response.body, pageMovies);
        if (rejected.length) {
          complete = false;
          diagnostics.push({ schemaVersion: 1 as const, category: 'data-quality' as const, stage: 'collection',
            code: 'extraction-incomplete', sourceInstanceId: instance.id,
            reason: 'Some listing entries or screening rows could not be extracted; page coverage is incomplete.',
            retryable: false, evidence: { url, page: page + 1, rejected } });
        }
        if (![...pageMovies.values()].some(movie => movie.showings.length)) throw new Error('The berlin.de page contained entries but no supported screenings');
        const before = [...movies.values()].reduce((sum, movie) => sum + movie.showings.length, 0);
        mergeBerlinPage(response.body, movies);
        deps.progress?.(listingCollection([...movies.values()].filter(movie => movie.showings.length), false,
          instance, berlinAdapter, observedAt, diagnostics));
        if ([...movies.values()].reduce((sum, movie) => sum + movie.showings.length, 0) === before) break;
        if (page === 19) throw new Error('berlin.de pagination limit reached; source is incomplete');
      } catch (error) {
        if (error instanceof SourcePersistenceError) throw error;
        complete = false;
        diagnostics.push({ schemaVersion: 1 as const, category: 'recovery' as const, stage: 'collection', code: 'page-failed',
          sourceInstanceId: instance.id, reason: (error as Error).message, retryable: true, evidence: { url, page: page + 1 } });
        break;
      }
    }
    if (!movies.size && diagnostics.length) throw new Error(diagnostics[0].reason);
    const collection = await legacyCollection([...movies.values()].filter(movie => movie.showings.length), complete, instance, berlinAdapter, deps, observedAt, diagnostics);
    return collection;
  },
};
