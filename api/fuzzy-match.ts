/** Lightweight string similarity for entity resolution — no external deps. */

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[!.\-–|/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalizeForMatch(text).split(' ').filter(Boolean);
}

const SKIP_TOKENS = new Set([
  'am', 'an', 'in', 'im', 'der', 'die', 'das', 'und', 'the', 'a', 'kino', 'berlin', 'film',
  'kinowelt', 'filmpalast', 'movie', 'magic', 'luxe',
]);

function significantTokens(text: string): string[] {
  return tokens(text).filter(t => !SKIP_TOKENS.has(t));
}

/** Token-set ratio (0–1): order-independent word overlap. */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  const intersection = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const avgSize = (ta.size + tb.size) / 2;
  const overlap = intersection / avgSize;
  const jaccard = intersection / union;
  return overlap * 0.6 + jaccard * 0.4;
}

const LOCATION_TOKENS = new Set([
  'mitte', 'kreuzberg', 'neukoelln', 'neukölln', 'charlottenburg', 'spandau',
  'tegel', 'hellersdorf', 'wedding', 'prenzlauer', 'friedrichshain', 'pankow',
  'steglitz', 'zehlendorf', 'tempelhof', 'schoeneberg', 'schöneberg', 'lichtenberg',
  'marzahn', 'treptow', 'koepenick', 'köpenick', 'reinickendorf', 'westend',
  'dahlem', 'potsdam', 'frankfurt', 'oder', 'wildau', 'neuruppin', 'bernau',
  'eastgate', 'alexanderplatz', 'zoo', 'gropius', 'east', 'side', 'gallery',
]);

function locationTokens(text: string): Set<string> {
  return new Set(tokens(text).filter(t => LOCATION_TOKENS.has(t)));
}

/** Penalize when both names carry distinct location qualifiers (different branches). */
export function locationConflict(a: string, b: string): boolean {
  const la = locationTokens(a);
  const lb = locationTokens(b);
  if (la.size === 0 || lb.size === 0) return false;
  for (const t of la) {
    if (!lb.has(t)) return true;
  }
  for (const t of lb) {
    if (!la.has(t)) return true;
  }
  return false;
}

export function cinemaMatchScore(
  nameA: string,
  nameB: string,
  addressA?: string,
  addressB?: string,
): number {
  let score = tokenSetRatio(nameA, nameB);
  if (locationConflict(nameA, nameB)) score *= 0.4;

  const sigA = significantTokens(nameA);
  const sigB = significantTokens(nameB);
  const shorter = sigA.length <= sigB.length ? sigA : sigB;
  const longer = new Set(sigA.length <= sigB.length ? sigB : sigA);
  if (shorter.length >= 2 && shorter.every(t => longer.has(t))) {
    score = Math.max(score, 0.94);
  }

  if (addressA && addressB) {
    const na = normalizeForMatch(addressA);
    const nb = normalizeForMatch(addressB);
    if (na && nb) {
      if (na === nb) score = Math.max(score, 0.98);
      else if (tokenSetRatio(na, nb) > 0.85) score = Math.max(score, 0.9);
    }
  }

  return Math.min(1, score);
}

export interface MovieMatchMeta {
  year?: number | null;
  director?: string | null;
  imdbId?: string | null;
  altTitle?: string | null;
}

export function movieMatchScore(
  titleA: string,
  titleB: string,
  metaA: MovieMatchMeta = {},
  metaB: MovieMatchMeta = {},
): number {
  if (metaA.imdbId && metaB.imdbId && metaA.imdbId === metaB.imdbId) return 1;

  let score = tokenSetRatio(titleA, titleB);

  if (metaA.altTitle) score = Math.max(score, tokenSetRatio(metaA.altTitle, titleB));
  if (metaB.altTitle) score = Math.max(score, tokenSetRatio(titleA, metaB.altTitle));
  if (metaA.altTitle && metaB.altTitle) {
    score = Math.max(score, tokenSetRatio(metaA.altTitle, metaB.altTitle));
  }

  if (metaA.year && metaB.year) {
    score *= metaA.year === metaB.year ? 1.05 : 0.5;
  }

  if (metaA.director && metaB.director) {
    const dScore = tokenSetRatio(metaA.director, metaB.director);
    if (dScore > 0.8) score = Math.min(1, score * 1.1);
    else if (dScore < 0.3) score *= 0.6;
  }

  return Math.min(1, score);
}

export const FUZZY_AUTO_MERGE = 0.92;
/** Minimum fuzzy score before trying embedding similarity in the gray zone. */
export const FUZZY_EMBED_MIN = 0.75;
