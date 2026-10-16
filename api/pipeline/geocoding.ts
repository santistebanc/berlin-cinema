import axios from 'axios';
import { fingerprint, normalize } from './domain';
import { parseVenueAddress, venueAddressesMatch, venueAddressTypoCompatible } from './addresses';
import { PipelineStore } from './store';

export interface GeoCandidate {
  placeId: string; name: string; address: string; latitude: number; longitude: number;
  category: string; resultType: string; confidence: number; buildingConfidence: number;
  city: string; suburb: string; websiteUrl?: string; addressMatches: boolean; nameMatches: boolean;
  insideBerlin: boolean | null; boundary?: { name: string; isoCode: string; osmId?: number };
  street?: string; houseNumber?: string; postalCode?: string; countryCode?: string; aliases?: string[];
  phone?: string; openingHours?: string; wheelchair?: string; externalIds?: Record<string, any>; raw?: Record<string, any>;
  addressEvidence?: VenueAddressEvidence[];
}
export interface VenueAddressEvidence { subject: string; source: string; address: string }
export interface GeoLookup {
  status: 'resolved' | 'ambiguous' | 'not-found' | 'low-confidence' | 'boundary-unavailable' | 'not-configured' | 'request-failed' | 'budget-exhausted' | 'offline';
  reason: string; candidates: GeoCandidate[]; selected?: GeoCandidate; cached?: boolean; fetchedAt?: string;
  query?: Record<string, any>;
  corroboratingAddresses?: VenueAddressEvidence[];
  addressAttempt?: { status: GeoLookup['status']; reason: string; query?: Record<string, any> };
}
export interface VenueQuery { name: string; address?: string; explicitCity?: string; search?: 'name'; corroboratingAddresses?: VenueAddressEvidence[] }
export interface VenueGeocoder { lookup(input: VenueQuery): Promise<GeoLookup> }

function score(value: any): number { return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0; }
export function berlinBoundary(features: any[]): { insideBerlin: boolean; name: string; isoCode: string; osmId?: number } | null {
  const states = features.map(feature => feature.properties ?? feature).filter(p => String(p.datasource?.raw?.admin_level ?? p.adminLevel) === '4'
    && (p.country_code === 'de' || p.countryCode === 'de'));
  const codes = [...new Set(states.map(p => p.iso3166_2 || p.isoCode || p.datasource?.raw?.['ISO3166-2']).filter((code: any) => /^DE-[A-Z]{2}$/.test(code)))];
  if (codes.length !== 1) return null;
  const state = states.find(p => (p.iso3166_2 || p.isoCode || p.datasource?.raw?.['ISO3166-2']) === codes[0]);
  return { insideBerlin: codes[0] === 'DE-BE', name: state.name, isoCode: codes[0], osmId: state.datasource?.raw?.osm_id ?? state.osmId };
}
export function geoNameMatches(name: string, place: any, addressCorroborated = false): boolean {
  const raw = place.datasource?.raw ?? {};
  const aliases = place.other_names ?? {};
  const names = [place.name, raw.name, raw['name:de'], raw.alt_name, raw.official_name, raw.short_name,
    aliases.alt_name, aliases.official_name, aliases.short_name, aliases['name:de']].filter((v): v is string => typeof v === 'string').flatMap(v => v.split(';'));
  const comparable = (value: string) => {
    let result = normalize(value).replace(/\bkinos\b/g, 'kino');
    if (addressCorroborated) result = result.replace(/\bkinowelt\b/g, '');
    return result.replace(/\s+/g, ' ').trim();
  };
  const query = comparable(name);
  const shortenedAtAddress = (label: string) => {
    if (!addressCorroborated) return false;
    const candidate = comparable(label);
    const generic = new Set(['kino', 'cinema', 'filmtheater', 'lichtspiele', 'theater', 'kinowelt']);
    const shorter = query.length < candidate.length ? query : candidate;
    const longer = query.length < candidate.length ? candidate : query;
    return !!shorter && longer.startsWith(`${shorter} `) && shorter.split(' ').some(token => token.length >= 3 && !generic.has(token));
  };
  return !!query && names.some(label => comparable(label) === query || shortenedAtAddress(label) || [place.city, place.suburb, place.quarter].filter(Boolean)
    .some(city => query === comparable(`${label} ${city}`)));
}

class GeoError extends Error { constructor(readonly status: GeoLookup['status'], message: string) { super(message); } }

/** Provider keys never enter persisted queries/results. Calls are bounded, throttled and cached under the pipeline writer lease. */
export class GeoapifyGeocoder implements VenueGeocoder {
  private requests = 0; private lastRequest = 0; private unavailable: GeoError | null = null;
  constructor(private store: PipelineStore, private apiKey = '', private options: {
    network?: boolean; now?: string; maxRequests?: number; dailyCreditLimit?: number; force?: boolean; intervalMs?: number;
  } = {}) {}
  private now() { return this.options.now ?? new Date().toISOString(); }
  private async get(path: string, params: Record<string, any>, credits = 1): Promise<any> {
    if (!this.apiKey) throw new GeoError('not-configured', 'Geoapify is not configured. Add GEOAPIFY_API_KEY to the server .env file.');
    if (this.options.network === false) throw new GeoError('offline', 'This run is offline; no uncached Geoapify request was made.');
    if (this.unavailable) throw this.unavailable;
    const limit = this.options.dailyCreditLimit ?? Number(process.env.GEOAPIFY_DAILY_CREDIT_LIMIT || 1000);
    const perRun = this.options.maxRequests ?? Number(process.env.GEOAPIFY_MAX_REQUESTS_PER_RUN || 80);
    if (![limit, perRun].every(value => Number.isInteger(value) && value >= 0)) throw new Error('Geoapify request limits must be nonnegative integers');
    const day = this.now().slice(0, 10); const key = `geoapify:usage:${day}`;
    const usage = this.store.resource(key)?.data ?? { requests: 0, creditsReserved: 0 };
    if (this.requests >= perRun || usage.creditsReserved + credits > limit) throw new GeoError('budget-exhausted', 'The application Geoapify request/credit limit was reached. Cached results remain usable.');
    const delay = (this.options.intervalMs ?? 250) - (Date.now() - this.lastRequest);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    this.requests++; this.lastRequest = Date.now();
    this.store.saveResource(key, { requests: usage.requests + 1, creditsReserved: usage.creditsReserved + credits }, this.now()); this.store.flush();
    try {
      const response = await axios.get(`https://api.geoapify.com/v1/${path}`, { params: { ...params, apiKey: this.apiKey },
        timeout: 12000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024 });
      return response.data;
    } catch (error: any) {
      const failure = new GeoError('request-failed', error.response?.status ? `Geoapify returned HTTP ${error.response.status}.` : 'Geoapify request failed or timed out.');
      // One failed provider must not trigger dozens of identical requests in the same run.
      this.unavailable = failure; throw failure;
    }
  }
  private async boundary(candidate: GeoCandidate): Promise<GeoCandidate> {
    const key = `geoapify:boundary:${fingerprint([candidate.latitude, candidate.longitude])}`;
    const cached = this.store.resource(key);
    let data = !this.options.force && cached && Date.parse(this.now()) - Date.parse(cached.fetchedAt) < 90 * 86400000 ? cached.data : null;
    if (!data) {
      const response = await this.get('boundaries/part-of', { lat: candidate.latitude, lon: candidate.longitude, boundaries: 'administrative', geometry: 'point', lang: 'de' }, 2);
      if (!Array.isArray(response.features)) throw new GeoError('request-failed', 'Geoapify returned an invalid boundary response.');
      data = berlinBoundary(response.features);
      if (data) this.store.saveResource(key, data, this.now());
    }
    return data ? { ...candidate, insideBerlin: data.insideBerlin, boundary: { name: data.name, isoCode: data.isoCode, osmId: data.osmId } } : candidate;
  }
  async lookup(input: VenueQuery): Promise<GeoLookup> {
    const nameSearch = !input.address || input.search === 'name';
    const material = { name: input.name, address: input.address || '', explicitCity: input.explicitCity || '',
      ...(input.search === 'name' && input.address ? { search: 'name' } : {}) };
    const key = `geoapify:venue:${!nameSearch ? 'v1' : input.address ? 'name-v3' : 'name-v2'}:${fingerprint(material)}`; const cached = this.store.resource(key);
    const freshCache = !this.options.force && cached && Date.parse(this.now()) - Date.parse(cached.fetchedAt)
      < (cached.data.status === 'resolved' ? 90 * 86400000 : cached.data.status === 'request-failed' ? 3600000 : 7 * 86400000);
    const revalidate = freshCache && cached!.data.candidates?.length && (['low-confidence', 'ambiguous'].includes(cached!.data.status)
      || input.corroboratingAddresses?.length || cached!.data.corroboratingAddresses?.length);
    if (freshCache && !revalidate) return { ...cached!.data, cached: true };
    const sourceAddress = input.address && !parseVenueAddress(input.address)?.city && input.explicitCity ? `${input.address}, ${input.explicitCity}` : input.address;
    const query: Record<string, any> = { ...(!nameSearch ? { text: sourceAddress }
      : { name: input.name, ...(input.explicitCity ? { city: input.explicitCity } : {}), type: 'amenity' }),
      filter: 'countrycode:de', bias: 'proximity:13.405,52.52', format: 'json', limit: 5, lang: 'de' };
    let candidates: GeoCandidate[] = [];
    const save = (result: GeoLookup) => {
      const fetchedAt = revalidate ? cached!.fetchedAt : this.now();
      const complete = { ...result, candidates, query, fetchedAt, ...(input.corroboratingAddresses?.length ? { corroboratingAddresses: input.corroboratingAddresses } : {}), ...(revalidate ? { cached: true } : {}) };
      if (!['not-configured', 'offline', 'budget-exhausted'].includes(result.status) && !/HTTP 40[13]/.test(result.reason)) this.store.saveResource(key, complete, fetchedAt);
      return complete;
    };
    const addressEvidence = (address: string) => (input.corroboratingAddresses ?? []).filter(evidence => input.address
      && venueAddressTypoCompatible(input.address, evidence.address) && venueAddressesMatch(evidence.address, address));
    try {
      if (revalidate) {
        candidates = cached!.data.candidates.map((candidate: GeoCandidate) => {
          const corroboration = addressEvidence(candidate.address);
          const addressMatches = !!input.address && (venueAddressesMatch(input.address, candidate.address) || corroboration.length > 0);
          return { ...candidate, addressMatches, addressEvidence: corroboration, nameMatches: geoNameMatches(input.name, candidate.raw ?? {
            name: candidate.name, city: candidate.city, suburb: candidate.suburb, datasource: { raw: { alt_name: candidate.aliases?.join(';') } },
          }, addressMatches) };
        });
      } else {
        const response = await this.get('geocode/search', query);
        if (!Array.isArray(response.results)) throw new GeoError('request-failed', 'Geoapify returned an invalid search response.');
        candidates = response.results.filter((p: any) => typeof p.place_id === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon)
          && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).map((p: any) => {
          const address = p.street && p.housenumber ? `${p.street} ${p.housenumber}${p.postcode || p.city ? `, ${[p.postcode, p.city].filter(Boolean).join(' ')}` : ''}`.trim() : '';
          const website = p.website || p.datasource?.raw?.website;
          const raw = p.datasource?.raw ?? {};
          const corroboration = addressEvidence(address);
          const addressMatches = !!input.address && (venueAddressesMatch(input.address, address) || corroboration.length > 0);
          return { placeId: p.place_id, name: p.name || '', address, latitude: p.lat, longitude: p.lon, category: p.category || '',
            resultType: p.result_type, confidence: score(p.rank?.confidence), buildingConfidence: score(p.rank?.confidence_building_level),
            city: p.city || '', suburb: p.suburb || p.quarter || '', websiteUrl: typeof website === 'string' && /^https?:\/\//i.test(website) ? website : undefined,
            addressMatches, addressEvidence: corroboration, nameMatches: geoNameMatches(input.name, p, addressMatches), insideBerlin: null,
            street: p.street, houseNumber: p.housenumber, postalCode: p.postcode, countryCode: p.country_code,
            aliases: [raw.alt_name, raw.official_name, raw.short_name, raw['name:de'], raw['name:en'], p.other_names?.alt_name,
              p.other_names?.official_name, p.other_names?.short_name, p.other_names?.['name:de']].filter(Boolean).flatMap(value => String(value).split(';')),
            phone: raw['contact:phone'] || raw.phone, openingHours: raw.opening_hours, wheelchair: raw.wheelchair,
            externalIds: { osmId: raw.osm_id, osmType: raw.osm_type, wikidata: raw.wikidata, wikipedia: raw.wikipedia }, raw: p };
        });
      }
      if (!candidates.length) return save({ status: 'not-found', reason: 'Geoapify returned no usable place candidates.', candidates });
      const addressMatches = candidates.filter(c => c.addressMatches && (c.buildingConfidence >= 0.95 || c.confidence >= 0.95));
      const named = candidates.filter(c => c.nameMatches && c.category === 'entertainment.cinema'
        && (c.confidence >= 0.95 || c.addressMatches) && (!!parseVenueAddress(c.address)
          || !!input.explicitCity && normalize(input.explicitCity) === normalize(c.city)));
      const eligible = addressMatches.length ? addressMatches : named;
      const groups = new Map<string, GeoCandidate[]>();
      for (const candidate of eligible) {
        const parsed = parseVenueAddress(candidate.address);
        const groupKey = parsed ? fingerprint([parsed.street, parsed.number, parsed.postalCode, parsed.city]) : candidate.placeId;
        groups.set(groupKey, [...(groups.get(groupKey) ?? []), candidate]);
      }
      if (groups.size === 1) {
        const group = [...groups.values()][0];
        // Several businesses may share an exact source address. This establishes geography, never shared cinema identity.
        const selected = await this.boundary(group[0]); candidates = candidates.map(c => c.placeId === selected.placeId ? selected : c);
        if (selected.insideBerlin === null) return save({ status: 'boundary-unavailable', reason: 'The boundary response did not identify one German state. Berlin eligibility remains unverified.', candidates });
        if (!selected.address && selected.insideBerlin) return save({ status: 'low-confidence', reason: 'A cinema point was found inside Berlin, but no street address was available. Address verification remains incomplete.', candidates });
        if (!selected.address) return save({ status: 'resolved', reason: 'Unique cinema name and city match; verified state boundary is outside Berlin. No street address was supplied by the API.', candidates, selected });
        return save({ status: 'resolved', reason: selected.addressEvidence?.length
          ? `Another current source with the same full cinema name exactly matches the API street and house number; source street spelling differs by one letter only, with identical house number, postcode and city. ${selected.category === 'entertainment.cinema' && selected.nameMatches ? 'Cinema identity and ' : ''}German state boundary verified.`
          : addressMatches.length ? 'Exact source address and precise building match; German state boundary verified.' : 'Unique cinema name and precise place match; German state boundary verified.', candidates, selected });
      }
      // Only cinema candidates are useful as identity choices; a street, mall or city centroid cannot stand in for the cinema.
      for (const candidate of candidates.filter(c => c.category === 'entertainment.cinema').slice(0, 3)) {
        const checked = await this.boundary(candidate); candidates = candidates.map(c => c.placeId === checked.placeId ? checked : c);
      }
      return save({ status: eligible.length ? 'ambiguous' : 'low-confidence', reason: eligible.length
        ? 'More than one physical address matches; no venue was chosen automatically.' : 'No sufficiently precise exact-address or unique cinema-name match was established. Provider ranking alone is not proof.', candidates });
    } catch (error) {
      const failure = error instanceof GeoError ? error : new GeoError('request-failed', 'Geoapify evidence could not be validated.');
      return save({ status: failure.status, reason: failure.message, candidates });
    }
  }
}
