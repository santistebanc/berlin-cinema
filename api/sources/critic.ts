import * as cheerio from 'cheerio';
import MovieParser from './critic-listings';
import FormDataBuilder from '../form-data-builder';
import { fingerprint } from '../pipeline/domain';
import { parseFilmMetadata } from './film-metadata';
import { parseCriticVenue } from './critic-venue';
import { legacyCollection, replayLegacy } from './legacy';
import type { SourceAdapter } from './types';

const listing = 'https://www.critic.de/ov-movies-berlin/';
const film = (url: URL) => url.hostname === 'www.critic.de' && /^\/(?:ov-movies-berlin\/)?movie\/[^/]+\/$/.test(url.pathname);
const venue = (url: URL) => url.hostname === 'www.critic.de' && /^\/ov-movies-berlin\/cinema\/[^/]+\/$/.test(url.pathname);

export function extractCriticFilm(html: string, sourceUrl: string) {
  const $ = cheerio.load(html);
  const items = $('.itemContainer').filter((_, element) => {
    const href = $(element).find('h2 a, h1 a').first().attr('href');
    try { return !!href && new URL(href, sourceUrl).href === sourceUrl; } catch { return false; }
  });
  const profiles = items.toArray().map(element => parseFilmMetadata($.html(element)));
  const fields = profiles.length && profiles.every(profile => fingerprint(profile) === fingerprint(profiles[0])) ? profiles[0] : {};
  const creditsChecked = Object.keys(fields).length > 0 || items.length > 0 && items.toArray().every(element =>
    /\b\d{1,2}:\d{2}\b/.test($(element).text()) && Object.keys(parseFilmMetadata($.html(element))).length === 0);
  return { fields, creditsChecked };
}
export const criticAdapter: SourceAdapter = {
  id: 'critic.de', extractionVersion: 'critic-v1', capabilities: ['screenings', 'film-details', 'venue-details'],
  allows: (url, purpose) => purpose === 'film' ? film(url) : purpose === 'venue' ? venue(url) : url.href === listing,
  film: { accepts: film, extract: extractCriticFilm },
  venue: { accepts: venue, extract: parseCriticVenue, needsLookup: () => true, cacheUsable: data => data.parserVersion >= 2 },
  replay: replayLegacy,
  async collect(instance, deps) {
    const response = await deps.request({ url: listing, method: 'POST', body: FormDataBuilder.buildSearchForm(),
      headers: { origin: 'https://www.critic.de', referer: listing, 'content-type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
    const rejected: string[] = [];
    const parser = new MovieParser({ ensureAbsoluteUrl: url => url && !url.startsWith('http') ? `https://www.critic.de${url}` : url },
      deps.now, reason => rejected.push(reason));
    const movies = parser.parseMovies(response.body);
    const diagnostics = rejected.length ? [{ schemaVersion: 1 as const, category: 'data-quality' as const, stage: 'collection',
      code: 'extraction-incomplete', sourceInstanceId: instance.id,
      reason: 'Some programme entries could not be extracted; coverage is incomplete.', retryable: false, evidence: { rejected } }] : [];
    return legacyCollection(movies, !rejected.length, instance, criticAdapter, deps, undefined, diagnostics);
  },
};
