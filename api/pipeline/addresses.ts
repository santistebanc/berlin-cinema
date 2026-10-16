/** Exact address evidence after spelling normalization; never fuzzy house-number matching. */
export function parseVenueAddress(value: string) {
  const text = (value || '').normalize('NFKC').replace(/[–—]/g, '-').trim();
  const streetLine = text.split(',')[0].trim();
  const match = streetLine.match(/^(.*?)\s+(\d+\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)?)(?=\s*,|\s+\d{5}\b|$)/i);
  if (!match) return null;
  const street = match[1].toLowerCase().replace(/ß/g, 'ss').replace(/straße|strasse|str\.?$/gi, 'str')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.\-]+/g, '');
  const number = match[2].toLowerCase().replace(/\s/g, '').replace('/', '-');
  const postalCode = text.match(/\b\d{5}\b/)?.[0] ?? null;
  const cityText = text.replace(/^.*?\b\d{5}\s*/, '').trim();
  const city = postalCode && cityText !== text && cityText ? cityText.toLowerCase().split(/\s+-\s+/)[0].trim() : null;
  return street ? { street, number, postalCode, city, sourceStreet: match[1].trim() } : null;
}

export function venueAddressesMatch(left: string, right: string): boolean {
  const a = parseVenueAddress(left); const b = parseVenueAddress(right);
  const expandedCity = a?.city && b?.city && a.postalCode && a.postalCode === b.postalCode
    && (a.city.startsWith(`${b.city} `) || b.city.startsWith(`${a.city} `));
  return !!a && !!b && a.street === b.street && a.number === b.number
    && !(a.postalCode && b.postalCode && a.postalCode !== b.postalCode)
    && !(a.city && b.city && a.city !== b.city && !expandedCity);
}

/** Only corroboration from another source can repair a one-letter street typo. */
export function venueAddressTypoCompatible(left: string, right: string): boolean {
  const a = parseVenueAddress(left); const b = parseVenueAddress(right);
  if (!a || !b || !a.postalCode || a.postalCode !== b.postalCode || !a.city || a.city !== b.city
    || a.number !== b.number || a.street.length < 8 || a.street.length !== b.street.length) return false;
  return [...a.street].filter((letter, index) => letter !== b.street[index]).length === 1;
}

/** A bounded street query retrieves evidence; exact address comparison accepts it later. */
export function osmStreetPattern(value: string): string | null {
  const parsed = parseVenueAddress(value); if (!parsed) return null;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const street = parsed.sourceStreet;
  const suffix = street.match(/(?:straße|strasse|str\.?)$/i);
  const stem = suffix ? street.slice(0, -suffix[0].length) : street;
  const pattern = escape(stem.trim()).replace(/\s+/g, '[[:space:]]+');
  return `^${pattern}${suffix ? '[[:space:]]*(straße|strasse|str\\.?)' : ''}$`;
}
