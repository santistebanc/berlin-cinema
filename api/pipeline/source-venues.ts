import axios from 'axios';
import * as cheerio from 'cheerio';
import { randomUUID } from 'crypto';
import { PipelineStore } from './store';
import { Observation, fingerprint } from './domain';
import { observation } from './observations';
import { parseVenueAddress } from './addresses';

export function parseVenueDetails(html: string, sourceUrl?: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
  if (sourceUrl && new URL(sourceUrl).hostname === 'www.critic.de') {
    const info = $('#kino_infos');
    const address = clean(info.find('address a.mob-adr-lnk').first().text());
    const parsed = parseVenueAddress(address);
    if (!parsed?.postalCode || !parsed.city) return null;
    const websites = info.children('a.external-link').filter((_, item) => /^Website of\s+\S/.test(clean($(item).text())));
    const fields: Record<string, string> = { address, postalCode: parsed.postalCode, explicitCity: parsed.city };
    if (websites.length === 1) {
      try {
        const url = new URL(websites.attr('href') || '');
        if (/^https?:$/.test(url.protocol) && !url.username && !url.password
          && !/(^|\.)critic\.de$/i.test(url.hostname)) {
          fields.websiteUrl = url.href;
          fields.websiteName = clean(websites.text()).replace(/^Website of\s+/, '');
        }
      } catch { /* An invalid link is not an official website. */ }
    }
    return fields;
  }
  const block = $('.article-attributes').filter((_, item) => $(item).find('.street-address').length > 0).first();
  const street = clean(block.find('.street-address').first().text());
  const postalCode = clean(block.find('.postal-code').first().text());
  const locality = clean(block.find('.locality').first().text());
  if (!street || !/^\d{5}$/.test(postalCode) || !locality) return null;
  // A source-supplied district suffix does not change its city.
  const city = locality.split(/\s+-\s+/)[0].trim();
  return { address: `${street}, ${postalCode} ${locality}`, postalCode, explicitCity: city };
}

async function fetchVenuePage(url: URL): Promise<string> {
  let current = url;
  for (let redirects = 0; ; redirects++) {
    const response = await axios.get(current.href, { timeout: 8000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OVBerlin/2.0)', 'Accept-Language': 'de-DE,de;q=0.9' } });
    if (!response.status || response.status < 300) return response.data;
    const location = response.headers?.location;
    if (redirects >= 3 || !location) throw new Error('Unsupported venue redirect');
    const next = new URL(location, current);
    if (next.origin !== url.origin || next.username || next.password
      || next.pathname.replace(/\/$/, '') !== url.pathname.replace(/\/$/, '')) throw new Error('Unsupported venue redirect');
    current = next;
  }
}

/** Venue URLs are deduplicated, bounded and cached independently from movie metadata. */
export async function fillVenueDetails(movies: any[], store: PipelineStore, maxLookups = 100,
  options: { network?: boolean; persist?: boolean; force?: boolean; now?: string } = {}): Promise<Map<string, any>> {
  const fetched = new Map<string, any>(); let lookups = 0;
  for (const movie of movies) for (const cinema of movie.cinemas ?? []) {
    const address = parseVenueAddress(cinema.address);
    const sourceUrl = cinema.url || movie.showings?.find((s: any) => s.cinema === cinema.name)?.url;
    let url: URL; try { url = new URL(sourceUrl); } catch { continue; }
    const critic = url.hostname === 'www.critic.de' && /^\/ov-movies-berlin\/cinema\/[^/]+\/$/.test(url.pathname);
    const berlin = url.hostname === 'www.berlin.de' && /^\/kino\/_bin\/kinodetail\.php\/\d+$/.test(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || !(critic || berlin)) continue;
    if (!critic && address?.postalCode && address.city) continue;
    const key = `source-venue:${url.href}`; const cached = store.resource(key);
    const rejectedRedirect = cached?.data.failed && /returned HTTP 30[12378]\./.test(cached.data.reason || '');
    const cacheTtl = cached?.data.failed ? cached.data.status === 'parse-failed' ? 12 * 3600000 : 5 * 60000 : 30 * 86400000;
    let details = fetched.get(key) ?? (!options.force && !rejectedRedirect && cached && (!critic || cached.data.parserVersion >= 2) && Date.parse(options.now ?? new Date().toISOString()) - Date.parse(cached.fetchedAt)
      < cacheTtl ? cached.data : null);
    if (!details && options.network !== false && lookups < maxLookups) {
      lookups++;
      try {
        const fields = parseVenueDetails(await fetchVenuePage(url), url.href);
        details = { url: url.href, fetchedAt: new Date().toISOString(), fields: fields ?? {}, parserVersion: 2, failed: !fields,
          status: fields ? 'resolved' : 'parse-failed', reason: fields ? 'Explicit address extracted from the source venue page.' : 'The venue page did not contain a supported structured address.' };
      } catch (error: any) { details = { url: url.href, fetchedAt: new Date().toISOString(), fields: {}, parserVersion: 2, failed: true, status: 'request-failed',
        reason: error.response?.status ? `Venue detail request returned HTTP ${error.response.status}.` : 'Venue detail request failed or timed out.' }; }
      fetched.set(key, details);
    }
    if (!details) {
      if (options.network !== false) cinema.addressEvidence = { url: url.href, status: 'deferred', reason: 'The per-run source venue lookup limit was reached. A later run can retrieve this address.' };
      continue;
    }
    Object.assign(cinema, details.fields, { url: url.href, addressEvidence: { url: url.href, fetchedAt: details.fetchedAt,
      status: details.status ?? (details.failed ? 'request-failed' : 'resolved'), reason: details.reason } });
    if (details.fields?.websiteUrl) cinema.websiteEvidence = { source: 'critic.de', sourceUrl: url.href,
      name: details.fields.websiteName, address: details.fields.address, fetchedAt: details.fetchedAt };
    for (const showing of movie.showings ?? []) if (showing.cinema === cinema.name && !showing.address) Object.assign(showing, details.fields);
  }
  const owner = randomUUID();
  if (options.persist !== false && fetched.size && store.acquireLease(owner)) {
    try { store.transaction(() => { for (const [key, details] of fetched) store.saveResource(key, details, details.fetchedAt); }); }
    finally { store.releaseLease(owner); }
  }
  return fetched;
}

/** Replays may repair venue facts without renewing the original listing/screening observation times. Caller owns the writer lease. */
export async function refreshVenueObservations(store: PipelineStore, venues: Observation[], options: { network?: boolean; force?: boolean; now?: string; maxLookups?: number } = {}): Promise<Observation[]> {
  const cinemas = venues.map(item => structuredClone(item.data));
  const resources = await fillVenueDetails([{ cinemas }], store, options.maxLookups ?? 100, { ...options, persist: false });
  const changed = venues.map((item, index) => ({ item, data: cinemas[index] })).filter(({ item, data }) => fingerprint(item.data) !== fingerprint(data));
  if (changed.length || resources.size) store.transaction(() => {
    for (const [key, details] of resources) store.saveResource(key, details, details.fetchedAt);
    for (const { item, data } of changed) store.observe({ ...item, ...observation(item.source, item.kind, item.sourceKey, data,
      item.observedAt, data.addressEvidence?.fetchedAt ?? item.fetchedAt) });
  });
  return venues.map(item => store.head(item.subject)!);
}
