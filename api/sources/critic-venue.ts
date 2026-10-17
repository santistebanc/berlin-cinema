import * as cheerio from 'cheerio';
import { parseVenueAddress } from '../pipeline/addresses';
export function parseCriticVenue(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
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
