import axios from 'axios';
import * as cheerio from 'cheerio';
import { PipelineStore } from './store';
import { Observation, fingerprint, normalize } from './domain';
import { observation } from './observations';
import { parseLabel } from './labels';
import { creditNames } from './identity-evidence';

export interface SourceDetails { url: string; fetchedAt: string; fields: Record<string, any>; failed?: boolean; parserVersion?: number; creditsChecked?: boolean; reason?: string }
export const detailKey = (url: string) => `source-detail:${url}`;

/** Metadata reviews refer to entities, while identity reviews can refer directly to observations. */
function reviewSourceUrls(store: PipelineStore): Set<string> {
  const issues = store.issues().filter(issue => issue.status === 'open');
  const entities = new Set(issues.map(issue => issue.details.entityId).filter(Boolean));
  const urls = new Set<string>(issues.flatMap(issue => [issue.details.observation, ...(issue.details.observations ?? [])])
    .map(item => item?.data?.url).filter(Boolean));
  for (const listing of store.observations(undefined, true))
    if (listing.kind === 'listing' && entities.has(store.link(listing.subject)?.entityId) && listing.data.url) urls.add(listing.data.url);
  return urls;
}

function sourceCreditsChecked(html: string, url: URL, fields: Record<string, any>): boolean {
  if (Object.keys(fields).length) return true;
  if (url.hostname !== 'www.critic.de') return false;
  const $ = cheerio.load(html);
  const items = $('.itemContainer').filter((_, element) => {
    const href = $(element).find('h2 a, h1 a').first().attr('href');
    try { return !!href && new URL(href, url).href === url.href; } catch { return false; }
  });
  // A matching populated listing is a supported empty-credit record; a blank/error page is not.
  return items.length > 0 && items.toArray().every(element => /\b\d{1,2}:\d{2}\b/.test($(element).text())
    && Object.keys(parseSourceDetails($.html(element))).length === 0);
}
export function parseSourceDetails(html: string, sourceUrl?: string): Record<string, any> {
  let $ = cheerio.load(html); const fields: Record<string, any> = {};
  if (sourceUrl && new URL(sourceUrl).hostname === 'www.critic.de') {
    // Critic detail URLs serve the listing layout. Never collect another film's fields from that page.
    const item = $('.itemContainer').filter((_, element) => {
      const href = $(element).find('h2 a, h1 a').first().attr('href');
      try { return !!href && new URL(href, sourceUrl).href === sourceUrl; } catch { return false; }
    });
    if (!item.length) return fields;
    if (item.length > 1) {
      const profiles = item.toArray().map(element => parseSourceDetails($.html(element)));
      return profiles.every(profile => fingerprint(profile) === fingerprint(profiles[0])) ? profiles[0] : fields;
    }
    $ = cheerio.load($.html(item));
  }
  const names = (value: any): string[] => (Array.isArray(value) ? value : value ? [value] : [])
    .map(v => typeof v === 'string' ? v : v?.name).filter((v): v is string => typeof v === 'string');
  const inspect = (item: any) => {
    if (Array.isArray(item)) { item.forEach(inspect); return; }
    if (!item || typeof item !== 'object') return;
    if (item['@graph']) inspect(item['@graph']);
    if ((Array.isArray(item['@type']) ? item['@type'] : [item['@type']]).includes('Movie')) {
      const director = names(item.director).join(', '); if (director) fields.director = director;
      const cast = names(item.actor); if (cast.length) fields.cast = cast;
      const year = String(item.datePublished ?? '').match(/^(18|19|20)\d{2}/); if (year) fields.year = Number(year[0]);
      const duration = String(item.duration ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
      if (duration) fields.runtime = Number(duration[1] || 0) * 60 + Number(duration[2] || 0);
      if (item.alternateName) fields.altTitle = names(item.alternateName).join(' / ');
    }
  };
  $('script[type="application/ld+json"]').each((_, element) => { try { inspect(JSON.parse($(element).text())); } catch { /* Invalid source JSON is not interpreted. */ } });
  $('dt').each((_, element) => {
    const label = $(element).text().trim().replace(/:$/, '').toLowerCase(); const value = $(element).next('dd').text().trim();
    if (!value) return;
    if (['regie', 'director', 'd'].includes(label)) fields.director = value;
    else if (['darsteller', 'cast', 'with'].includes(label)) fields.cast = value.split(',').map(v => v.trim()).filter(Boolean);
    else if (label === 'produktion') {
      const production = value.match(/^(.+?)\s+((?:18|19|20)\d{2})$/);
      if (production) { fields.country = production[1]; fields.year = Number(production[2]); }
    }
    else if (['jahr', 'produktionsjahr', 'year'].includes(label) && /^(18|19|20)\d{2}$/.test(value)) fields.year = Number(value);
    else if (['länge', 'laufzeit', 'runtime'].includes(label) && /^\d+\s*(?:min(?:uten)?\.?)?$/i.test(value)) fields.runtime = Number(value.match(/\d+/)![0]);
    else if (['land', 'country'].includes(label)) fields.country = value;
    else if (['originaltitel', 'original title'].includes(label)) { fields.originalTitle = value; fields.altTitle = value; }
  });
  return fields;
}

/** Bounded optional detail retrieval before identity decisions. Cached fields retain their actual fetch time. */
export async function fillSourceDetails(movies: any[], store: PipelineStore, maxLookups = 40,
  options: { network?: boolean; now?: string } = {}): Promise<Map<string, SourceDetails>> {
  const fetched = new Map<string, SourceDetails>(); let lookups = 0;
  const unresolvedUrls = reviewSourceUrls(store);
  const prioritized = [...movies].sort((a, b) => Number(unresolvedUrls.has(b.url)) - Number(unresolvedUrls.has(a.url)));
  for (const movie of prioritized) {
    if (!movie.url || (movie.year && movie.director)) continue;
    let url: URL;
    try { url = new URL(movie.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password
      || !(url.hostname === 'www.berlin.de' && url.pathname.startsWith('/kino/_bin/filmdetail.php/')
        || url.hostname === 'www.critic.de' && /^\/(?:ov-movies-berlin\/)?movie\/[^/]+\/$/.test(url.pathname))) continue;
    const cached = store.resource(detailKey(url.href));
    let details = fetched.get(url.href) ?? (cached && cached.data.parserVersion >= 2 && (!cached.data.failed || cached.data.parserVersion >= 5)
      && (cached.data.creditsChecked !== undefined || Object.keys(cached.data.fields ?? {}).length > 0)
      && Date.parse(options.now ?? new Date().toISOString()) - Date.parse(cached.fetchedAt) < (cached.data.failed ? 5 * 60000 : 7 * 86400000) ? cached.data : null);
    if (!details && options.network !== false && lookups < maxLookups) {
      lookups++;
      try {
        const request = () => axios.get(url.href, { timeout: 8000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OVBerlin/2.0)', 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' } });
        let response;
        try { response = await request(); }
        catch (error: any) {
          if (![307, 408, 429, 500, 502, 503, 504].includes(error.response?.status)) throw error;
          // A temporary upstream response is not evidence of absent credits. Retry the same allowlisted URL once.
          await new Promise(resolve => setTimeout(resolve, 250));
          response = await request();
        }
        const fields = parseSourceDetails(response.data, url.href);
        const creditsChecked = sourceCreditsChecked(response.data, url, fields);
        details = { url: url.href, fields, fetchedAt: new Date().toISOString(), parserVersion: 5, creditsChecked, failed: !creditsChecked,
          ...(!creditsChecked ? { reason: 'The source page contained no supported credit fields or confirmed empty-credit record.' } : {}) };
      } catch (error: any) { details = { url: url.href, fields: {}, fetchedAt: new Date().toISOString(), failed: true, parserVersion: 5, creditsChecked: false,
        reason: error.response?.status ? `Source detail request returned HTTP ${error.response.status}.` : 'Source detail request failed or timed out.' }; }
      fetched.set(url.href, details);
    }
    if (!details) continue;
    movie.sourceDetails = details; movie.listingFields ??= {};
    for (const [field, value] of Object.entries(details.fields)) {
      if (!Object.hasOwn(movie.listingFields, field)) movie.listingFields[field] = movie[field] ?? null;
      if (movie[field] == null || movie[field] === '') movie[field] = value;
    }
  }
  return fetched;
}

/** Recalculation consumes detail evidence before identity resolution, without renewing listing freshness. */
export async function refreshListingObservations(store: PipelineStore, listings: Observation[], options: { network?: boolean; now?: string } = {}): Promise<Observation[]> {
  const rows = listings.map(item => structuredClone(item.data));
  await fillSourceDetails(rows, store, 0, { ...options, network: false });
  const unresolvedUrls = reviewSourceUrls(store);
  const titles = new Map<string, Set<string>>();
  for (const row of rows) for (const title of [row.originalTitle, row.rawTitle || row.title, row.altTitle, row.displayTitle].filter(Boolean)) {
    if (!row.url || parseLabel(title).kind !== 'film') continue;
    const key = normalize(parseLabel(title).title);
    const urls = titles.get(key) ?? new Set<string>(); urls.add(row.url); titles.set(key, urls);
  }
  const duplicateUrls = new Set([...titles.values()].filter(urls => urls.size > 1).flatMap(urls => [...urls]));
  const fetched = await fillSourceDetails(rows.filter(row => unresolvedUrls.has(row.url) || duplicateUrls.has(row.url)
    && !(creditNames(row.director).length && row.year)), store, 40, options);
  const changed = listings.map((item, index) => ({ item, data: rows[index] })).filter(({ item, data }) => fingerprint(item.data) !== fingerprint(data));
  if (changed.length || fetched.size) store.transaction(() => {
    for (const [url, details] of fetched) store.saveResource(detailKey(url), details, details.fetchedAt);
    for (const { item, data } of changed) store.observe({ ...item, ...observation(item.source, item.kind, item.sourceKey, data,
      item.observedAt, data.sourceDetails?.fetchedAt ?? item.fetchedAt) });
  });
  return listings.map(item => store.head(item.subject)!);
}
