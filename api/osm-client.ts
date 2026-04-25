import https from 'https';
import http from 'http';

interface OsmCinema {
  name: string;
  website: string;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function fetchJson(url: string): Promise<any> {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, { headers: { 'User-Agent': 'berlin-cinema-app/1.0' } }, res => {
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

export async function geocodeCinema(address: string, postalCode: string, city: string): Promise<{ lat: number; lon: number } | null> {
  const q = encodeURIComponent(`${address}, ${postalCode} ${city}, Germany`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=de`;
  try {
    const results = await fetchJson(url);
    if (results && results.length > 0) {
      return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
    }
  } catch (e) {
    console.warn(`[nominatim] Geocoding failed for "${address}":`, (e as Error).message);
  }
  return null;
}

export async function fetchBerlinCinemaWebsites(): Promise<Map<string, string>> {
  const query = `[out:json][timeout:25];
area["name"="Berlin"]["admin_level"="4"]->.b;
(node["amenity"="cinema"](area.b);way["amenity"="cinema"](area.b););
out tags;`;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);

  const result = new Map<string, string>();
  for (const el of (data.elements ?? [])) {
    const name: string = el.tags?.name;
    const website: string = el.tags?.website || el.tags?.['contact:website'];
    if (name && website) {
      result.set(normalize(name), website.startsWith('http') ? website : `https://${website}`);
    }
  }

  console.log(`[osm] Found ${result.size} Berlin cinemas with websites`);
  return result;
}

export function matchCinemaWebsite(cinemaName: string, osmMap: Map<string, string>): string | null {
  const key = normalize(cinemaName);

  // Exact match
  if (osmMap.has(key)) return osmMap.get(key)!;

  // Substring match — scraped name might be shorter or longer than OSM name
  for (const [osmKey, website] of osmMap) {
    if (key.includes(osmKey) || osmKey.includes(key)) return website;
  }

  return null;
}
