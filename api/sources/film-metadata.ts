import * as cheerio from 'cheerio';

export function parseFilmMetadata(html: string): Record<string, any> {
  const $ = cheerio.load(html); const fields: Record<string, any> = {};
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

/** Berlin's synopsis precedes Filmdaten; screening and sidebar paragraphs are not film metadata. */
export function parseBerlinFilmMetadata(html: string): Record<string, any> {
  const $ = cheerio.load(html);
  const fields = parseFilmMetadata(html);
  const attributes = $('.article-attributes').filter((_, element) => $(element).find('h2').text().trim() === 'Filmdaten').first();
  if (!attributes.length) return fields;
  const synopsis = attributes.prevUntil('h1').filter('p').toArray().reverse()
    .map(element => $(element).text().replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
  if (synopsis) fields.plot = synopsis;
  attributes.find('dt').each((_, element) => {
    const label = $(element).text().trim().replace(/:$/, '').toLowerCase();
    const dd = $(element).next('dd'); const value = dd.text().trim();
    if (label === 'genre' && value) fields.genres = value.split(',').map(genre => genre.trim()).filter(Boolean);
    if (label === 'fsk' && /^(?:0|6|12|16|18)$/.test(value)) fields.ageRating = value;
    if (label === 'filmstart') {
      const parts = value.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
      if (parts) {
        const year = parts[3].length === 2 ? 2000 + Number(parts[3]) : Number(parts[3]);
        const iso = `${year}-${parts[2]}-${parts[1]}`;
        if (Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso) fields.germanReleaseDate = iso;
      }
    }
    if (label === 'filmwebsite') {
      const href = dd.find('a').first().attr('href');
      try { const url = new URL(href || ''); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) fields.homepage = url.href; } catch { /* No usable official URL. */ }
    }
  });
  return fields;
}
