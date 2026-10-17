import { SourcePersistenceError, type SourceAdapter, type SourceDependencies, type SourceInstance } from './types';

export interface DetailOptions { maxLookups?: number; force?: boolean; onProgress?(): void }
const DAY = 86400000;
const fresh = (deps: SourceDependencies, cached: any, ttl: number) => cached
  && Date.parse(deps.now()) - Date.parse(cached.fetchedAt) < ttl;

/** Optional evidence uses independent caches and never changes a listing's observedAt. */
export async function collectFilmDetails(movies: any[], adapter: SourceAdapter, deps: SourceDependencies,
  options: DetailOptions = {}): Promise<Map<string, any>> {
  const fetched = new Map<string, any>(); let lookups = 0;
  if (!adapter.film) return fetched;
  for (const movie of movies) {
    if (!movie.url || (movie.year && movie.director)) continue;
    let url: URL; try { url = new URL(movie.url); } catch { continue; }
    if (!adapter.film.accepts(url) || url.protocol !== 'https:' || url.username || url.password) continue;
    const cached = deps.cache.get(`source-detail:${url.href}`);
    let details = fetched.get(url.href) ?? (!options.force && cached && cached.data.parserVersion >= 2
      && (!cached.data.failed || cached.data.parserVersion >= 5)
      && (cached.data.creditsChecked !== undefined || Object.keys(cached.data.fields ?? {}).length)
      && fresh(deps, cached, cached.data.failed ? 5 * 60000 : 7 * DAY) ? cached.data : null);
    if (!details && deps.network !== false && lookups < (options.maxLookups ?? 40)) {
      lookups++;
      try {
        const response = await deps.request({ url: url.href, purpose: 'film', timeout: 8000 });
        const extracted = adapter.film.extract(response.body, url.href);
        details = { url: url.href, ...extracted, fetchedAt: deps.now(), parserVersion: 5, failed: !extracted.creditsChecked,
          ...(!extracted.creditsChecked ? { reason: 'The source page contained no supported credit fields or confirmed empty-credit record.' } : {}) };
      } catch (error: any) {
        if (error instanceof SourcePersistenceError) throw error;
        details = { url: url.href, fields: {}, fetchedAt: deps.now(), failed: true, parserVersion: 5, creditsChecked: false,
          reason: error.response?.status ? `Source detail request returned HTTP ${error.response.status}.` : 'Source detail request failed or timed out.' };
      }
      fetched.set(url.href, details);
      if (details.failed) deps.diagnostic({ schemaVersion: 1, category: 'recovery', stage: 'film-details', code: 'detail-unavailable',
        sourceInstanceId: '', reason: details.reason, retryable: true });
    }
    if (!details) continue;
    movie.sourceDetails = details; movie.listingFields ??= {};
    for (const [field, value] of Object.entries(details.fields)) {
      if (!Object.hasOwn(movie.listingFields, field)) movie.listingFields[field] = movie[field] ?? null;
      if (movie[field] == null || movie[field] === '') movie[field] = value;
    }
    options.onProgress?.();
  }
  return fetched;
}

async function venuePage(url: URL, deps: SourceDependencies): Promise<string> {
  let current = url;
  for (let redirects = 0; ; redirects++) {
    const response = await deps.request({ url: current.href, purpose: 'venue', timeout: 8000 });
    if (!response.status || response.status < 300) return response.body;
    if (redirects >= 3 || !response.headers.location) throw new Error('Unsupported venue redirect');
    const next = new URL(response.headers.location, current);
    if (next.origin !== url.origin || next.username || next.password
      || next.pathname.replace(/\/$/, '') !== url.pathname.replace(/\/$/, '')) throw new Error('Unsupported venue redirect');
    current = next;
  }
}

export async function collectVenueDetails(movies: any[], instance: SourceInstance, adapter: SourceAdapter,
  deps: SourceDependencies, options: DetailOptions = {}): Promise<Map<string, any>> {
  const fetched = new Map<string, any>(); let lookups = 0;
  if (!adapter.venue) return fetched;
  for (const movie of movies) for (const cinema of movie.cinemas ?? []) {
    const sourceUrl = cinema.url || movie.showings?.find((showing: any) => showing.cinema === cinema.name)?.url;
    let url: URL; try { url = new URL(sourceUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || !adapter.venue.accepts(url) || !adapter.venue.needsLookup(cinema)) continue;
    const key = `source-venue:${url.href}`; const cached = deps.cache.get(key);
    const rejectedRedirect = cached?.data.failed && /returned HTTP 30[12378]\./.test(cached.data.reason || '');
    const ttl = cached?.data.failed ? cached.data.status === 'parse-failed' ? 12 * 3600000 : 5 * 60000 : 30 * DAY;
    let details = fetched.get(key) ?? (!options.force && !rejectedRedirect && cached && adapter.venue.cacheUsable(cached.data)
      && fresh(deps, cached, ttl) ? cached.data : null);
    if (!details && deps.network !== false && lookups < (options.maxLookups ?? 100)) {
      lookups++;
      try {
        const fields = adapter.venue.extract(await venuePage(url, deps), url.href);
        details = { url: url.href, fetchedAt: deps.now(), fields: fields ?? {}, parserVersion: 2, failed: !fields,
          status: fields ? 'resolved' : 'parse-failed', reason: fields ? 'Explicit address extracted from the source venue page.' : 'The venue page did not contain a supported structured address.' };
      } catch (error: any) {
        if (error instanceof SourcePersistenceError) throw error;
        details = { url: url.href, fetchedAt: deps.now(), fields: {}, parserVersion: 2, failed: true, status: 'request-failed',
          reason: error.response?.status ? `Venue detail request returned HTTP ${error.response.status}.` : 'Venue detail request failed or timed out.' };
      }
      fetched.set(key, details);
      if (details.failed) deps.diagnostic({ schemaVersion: 1, category: 'recovery', stage: 'venue-details', code: 'detail-unavailable',
        sourceInstanceId: instance.id, reason: details.reason, retryable: true });
    }
    if (!details) {
      if (deps.network !== false) cinema.addressEvidence = { url: url.href, status: 'deferred', reason: 'The per-run source venue lookup limit was reached. A later run can retrieve this address.' };
      continue;
    }
    Object.assign(cinema, details.fields, { url: url.href, addressEvidence: { url: url.href, fetchedAt: details.fetchedAt,
      status: details.status ?? (details.failed ? 'request-failed' : 'resolved'), reason: details.reason } });
    if (details.fields?.websiteUrl) cinema.websiteEvidence = { source: instance.id, sourceUrl: url.href,
      name: details.fields.websiteName, address: details.fields.address, fetchedAt: details.fetchedAt };
    for (const showing of movie.showings ?? []) if (showing.cinema === cinema.name && !showing.address) Object.assign(showing, details.fields);
    options.onProgress?.();
  }
  return fetched;
}
