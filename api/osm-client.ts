import https from 'https';
import fs from 'fs';
import path from 'path';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/\s+/g, ' ').trim();
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'berlin-cinema-app/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

export interface OsmCinema {
  name: string;
  address: string | null;
  website: string | null;
}

let _osmCinemasCache: OsmCinema[] | null = null;

export async function fetchBerlinCinemas(): Promise<OsmCinema[]> {
  if (_osmCinemasCache) return _osmCinemasCache;

  const query = `[out:json][timeout:25];
area["name"="Berlin"]["admin_level"="4"]->.b;
(node["amenity"="cinema"](area.b);way["amenity"="cinema"](area.b););
out tags;`;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);

  const cinemas: OsmCinema[] = [];
  for (const el of (data.elements ?? [])) {
    const name: string | undefined = el.tags?.name;
    if (!name) continue;
    const website: string | undefined = el.tags?.website || el.tags?.['contact:website'];
    const street: string | undefined = el.tags?.['addr:street'];
    const housenumber: string | undefined = el.tags?.['addr:housenumber'];
    const address = street && housenumber ? `${street} ${housenumber}` : (street ?? null);
    cinemas.push({
      name,
      address: address ?? null,
      website: website ? (website.startsWith('http') ? website : `https://${website}`) : null,
    });
  }

  _osmCinemasCache = cinemas;
  console.log(`[osm] Found ${cinemas.length} Berlin cinemas in OSM`);
  return cinemas;
}

export async function fetchBerlinCinemaWebsites(): Promise<Map<string, string>> {
  const cinemas = await fetchBerlinCinemas();
  const result = new Map<string, string>();
  for (const c of cinemas) {
    if (c.website) result.set(normalize(c.name), c.website);
  }
  return result;
}

export function matchCinemaWebsite(cinemaName: string, osmMap: Map<string, string>): string | null {
  const key = normalize(cinemaName);
  if (osmMap.has(key)) return osmMap.get(key)!;
  for (const [osmKey, website] of osmMap) {
    if (key.includes(osmKey) || osmKey.includes(key)) return website;
  }
  return null;
}

/**
 * Find the OSM cinema entry for a given scraped name (exact norm or substring).
 */
export function findOsmCinema(cinemaName: string, osmCinemas: OsmCinema[]): OsmCinema | null {
  const key = normalize(cinemaName);
  let best: OsmCinema | null = null;
  for (const c of osmCinemas) {
    const osmKey = normalize(c.name);
    if (osmKey === key) return c;
    if (!best && (key.includes(osmKey) || osmKey.includes(key))) best = c;
  }
  return best;
}

/**
 * Given a list of unresolved cinema names (not in entities.json), attempt address-based
 * deduplication against known canonical cinema names. Returns a list of discovered aliases
 * { alias, canonical } and logs the ones that remain unresolved.
 *
 * Also auto-updates entities.json by appending the discovered aliases.
 */
export async function resolveNewCinemasViaOsm(
  newCinemaNames: string[],
  knownCanonicalNames: string[],
  entitiesPath: string,
  autoUpdate = true,
): Promise<{ alias: string; canonical: string }[]> {
  if (newCinemaNames.length === 0) return [];

  let osmCinemas: OsmCinema[];
  try {
    osmCinemas = await fetchBerlinCinemas();
  } catch (e) {
    console.warn('[osm] Cannot resolve new cinemas — OSM fetch failed:', (e as Error).message);
    return [];
  }

  // Build address → canonical name map for known canonicals
  const canonicalAddressMap = new Map<string, string>(); // normalizedAddr → canonicalName
  for (const canonical of knownCanonicalNames) {
    const osm = findOsmCinema(canonical, osmCinemas);
    if (osm?.address) {
      canonicalAddressMap.set(normalizeAddress(osm.address), canonical);
    }
  }

  const discovered: { alias: string; canonical: string }[] = [];
  const unresolved: string[] = [];

  for (const alias of newCinemaNames) {
    const osm = findOsmCinema(alias, osmCinemas);
    if (osm?.address) {
      const normAddr = normalizeAddress(osm.address);
      const canonical = canonicalAddressMap.get(normAddr);
      if (canonical) {
        discovered.push({ alias, canonical });
        console.log(`[osm] Resolved new cinema: "${alias}" → "${canonical}" (same address: ${osm.address})`);
        continue;
      }
    }
    unresolved.push(alias);
  }

  if (unresolved.length > 0) {
    console.log(`[entities] ${unresolved.length} unresolved new cinema(s): ${unresolved.join(', ')}`);
  }

  if (discovered.length > 0 && autoUpdate) {
    // Auto-update entities.json
    const entities = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
    for (const { alias, canonical } of discovered) {
      const entry = entities.cinemas.find((e: any) => e.canonical === canonical);
      if (entry) {
        if (!entry.aliases.includes(alias)) entry.aliases.push(alias);
      } else {
        entities.cinemas.push({ canonical, aliases: [alias] });
      }
    }
    fs.writeFileSync(entitiesPath, JSON.stringify(entities, null, 2));
    console.log(`[entities] Auto-updated entities.json with ${discovered.length} new alias(es)`);
  }

  return discovered;
}
