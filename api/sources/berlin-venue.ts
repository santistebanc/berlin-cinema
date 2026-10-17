import * as cheerio from 'cheerio';
export function parseBerlinVenue(html: string, sourceUrl?: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
  const block = $('.article-attributes').filter((_, item) => $(item).find('.street-address').length > 0).first();
  const street = clean(block.find('.street-address').first().text());
  const postalCode = clean(block.find('.postal-code').first().text());
  const locality = clean(block.find('.locality').first().text());
  if (!street || !/^\d{5}$/.test(postalCode) || !locality) return null;
  // A source-supplied district suffix does not change its city.
  const city = locality.split(/\s+-\s+/)[0].trim();
  return { address: `${street}, ${postalCode} ${locality}`, postalCode, explicitCity: city };
}
