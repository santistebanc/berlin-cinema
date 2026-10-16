import https from 'https';

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let deadline: ReturnType<typeof setTimeout>;
    const fail = (error: Error) => {
      clearTimeout(deadline);
      reject(error);
    };
    const req = https.get(url, { headers: { 'User-Agent': 'berlin-cinema-app/1.0' } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`OSM request failed: HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('error', fail);
      res.on('aborted', () => fail(new Error('OSM response was interrupted')));
      res.on('end', () => {
        clearTimeout(deadline);
        try { resolve(JSON.parse(data)); }
        catch (e) { fail(e as Error); }
      });
    });
    deadline = setTimeout(() => req.destroy(new Error('OSM request timed out after 30 seconds')), 30000);
    req.on('error', fail);
  });
}

export interface OsmAddress {
  id?: string;
  address: string | null;
  insideBerlin?: boolean;
  latitude?: number;
  longitude?: number;
  street?: string; houseNumber?: string; postalCode?: string; city?: string; district?: string;
  tags?: Record<string, string>;
}
export interface OsmCinema extends OsmAddress {
  id?: string;
  name: string;
  address: string | null;
  website: string | null;
  insideBerlin?: boolean;
  latitude?: number;
  longitude?: number;
  aliases?: string[]; phone?: string; email?: string; openingHours?: string; wheelchair?: string;
}

function addressFields(tags: Record<string, string>) {
  return { street: tags['addr:street'], houseNumber: tags['addr:housenumber'], postalCode: tags['addr:postcode'],
    city: tags['addr:city'] || 'Berlin', district: tags['addr:suburb'] || tags['addr:district'], tags: { ...tags } };
}

let _osmCinemasCache: OsmCinema[] | null = null;

export async function fetchBerlinCinemas(): Promise<OsmCinema[]> {
  if (_osmCinemasCache) return _osmCinemasCache;

  const query = `[out:json][timeout:25];
area["name"="Berlin"]["admin_level"="4"]->.b;
(node["amenity"="cinema"](area.b);way["amenity"="cinema"](area.b););
out center tags;`;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data.elements) || data.remark) {
    throw new Error('OSM returned an incomplete cinema response');
  }

  const cinemas: OsmCinema[] = [];
  for (const el of (data.elements ?? [])) {
    const name: string | undefined = el.tags?.name;
    if (!name) continue;
    const website: string | undefined = el.tags?.website || el.tags?.['contact:website'];
    const street: string | undefined = el.tags?.['addr:street'];
    const housenumber: string | undefined = el.tags?.['addr:housenumber'];
    const address = street && housenumber ? `${street} ${housenumber}${el.tags?.['addr:postcode'] ? `, ${el.tags['addr:postcode']} Berlin` : ''}` : (street ?? null);
    cinemas.push({
      ...addressFields(el.tags ?? {}),
      id: `${el.type}/${el.id}`,
      name,
      address: address ?? null,
      website: website ? (website.startsWith('http') ? website : `https://${website}`) : null,
      insideBerlin: true,
      latitude: el.lat ?? el.center?.lat,
      longitude: el.lon ?? el.center?.lon,
      aliases: [...new Set<string>(['alt_name', 'official_name', 'old_name', 'name:de', 'name:en'].flatMap(key => el.tags?.[key]?.split(';') ?? []).filter(Boolean))],
      phone: el.tags?.['contact:phone'] || el.tags?.phone, email: el.tags?.['contact:email'] || el.tags?.email,
      openingHours: el.tags?.opening_hours, wheelchair: el.tags?.wheelchair,
    });
  }

  _osmCinemasCache = cinemas;
  console.log(`[osm] Found ${cinemas.length} Berlin cinemas in OSM`);
  return cinemas;
}

export async function fetchBerlinAddresses(patterns: string[]): Promise<OsmAddress[]> {
  if (!patterns.length) return [];
  const pattern = patterns.map(value => `(${value})`).join('|');
  const query = `[out:json][timeout:25];area["name"="Berlin"]["admin_level"="4"]->.b;
nwr["addr:street"~${JSON.stringify(pattern)},i]["addr:housenumber"](area.b);out center tags;`;
  const data = await fetchJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
  if (!Array.isArray(data.elements) || data.remark) throw new Error('OSM returned an incomplete address response');
  return data.elements.filter((el: any) => el.tags?.['addr:street'] && el.tags?.['addr:housenumber']).map((el: any) => ({
    ...addressFields(el.tags),
    id: `${el.type}/${el.id}`, insideBerlin: true,
    address: `${el.tags['addr:street']} ${el.tags['addr:housenumber']}${el.tags['addr:postcode'] ? `, ${el.tags['addr:postcode']} Berlin` : ''}`,
    latitude: el.lat ?? el.center?.lat, longitude: el.lon ?? el.center?.lon,
  }));
}
