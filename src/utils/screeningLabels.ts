import type { Modality, ParsedLabel } from '../../api/pipeline/domain';

export function emptyModality(): Modality {
  return { version: 'unknown', spokenLanguage: null, subtitleLanguage: null, subtitled: null,
    projection: [], edition: null, context: [], unknown: [] };
}

const projections: [RegExp, string][] = [
  [/^imax\s*3d$/i, 'Imax 3D'], [/^imax$/i, 'Imax'], [/^mxp\s*2d$/i, 'MXP 2D'],
  [/^mxp$/i, 'MXP'], [/^plf\s*2d$/i, 'PLF 2D'], [/^plf$/i, 'PLF'], [/^expn$/i, 'EXPN'], [/^hfr$/i, 'HFR'],
  [/^3-?d$/i, '3D'], [/^2-?d$/i, '2D'], [/^70\s*mm$/i, '70 mm'], [/^35\s*mm$/i, '35 mm'],
];
const editions = /^(extended(?:\s+(?:cut|version|edition))?|director['’]?s\s+cut|final\s+cut|theatrical\s+cut|restauriert(?:e\s+fassung)?|restored|restoration|restaurierung|\d+k\s+restoration)$/i;
const contexts = /^(q\s*&\s*a|premiere|preview|sneak\s*preview|live|live[- ]übertragung|mit\s+(?:gast|gästen))$/i;

export function canonicalEdition(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (/^extended(?: (?:cut|version|edition))?$/i.test(text)) return 'Extended';
  if (/^director['’]?s cut$/i.test(text)) return "Director's Cut";
  if (/^final cut$/i.test(text)) return 'Final Cut';
  if (/^theatrical cut$/i.test(text)) return 'Theatrical Cut';
  if (/^(?:restauriert(?:e fassung)?|restored|restoration|restaurierung)$/i.test(text)) return 'Restored';
  if (/^\d+k restoration$/i.test(text)) return text.toUpperCase().replace('RESTORATION', 'Restoration');
  return text;
}

/** Explicit programme labels establish listing type, never the identity of their constituent films. */
export function programmeRule(title: string): string | null {
  if (/^(?:double\s+(?:feature|bill)\s*:\s*\S.+|.+\s+double\s+(?:feature|bill))$/i.test(title)) return 'double-feature';
  if (/^[\p{L}\p{N}][\p{L}\p{N} '&’.-]*\s+cinema\s+days(?:\s+[\p{L}][\p{L} .-]*)?(?:\s+\d{4})?$/iu.test(title)) return 'named-film-festival';
  if (/^überraschungsfilm$/i.test(title)) return 'unidentified-sneak';
  if (/^shorts\s+attack!?\s*[-–:]\s*\S.+$/i.test(title)) return 'shorts-programme';
  if (/^[\p{L}\p{N}][\p{L}\p{N} '&’.-]*\s+filmtage(?:\s+\d{4})?$/iu.test(title)) return 'named-film-festival';
  if (/^(?:sneak\s+preview(?:\s+ab\s+\d{1,2})?|cinesneak)$/i.test(title)) return 'unidentified-sneak';
  if (/^(?:shorts\s+attack\s*[-–:]\s*)?kurzfilm(?:\s*\(e\)|e|programm)?$/i.test(title)) return 'shorts-programme';
  if (/^filmreihe(?:\s*\(n\)|n)?$/i.test(title)) return 'film-series';
  if (/^met\s+(?:im\s+kino\s*:|opera\s+(?:\d{4}\/\d{2,4}\s*)?:)/i.test(title)) return 'met-broadcast';
  if (/^(?:\d+\.\s*)?[\p{L}\p{N}][\p{L}\p{N} '&’.-]*film\s*festival(?:\s+berlin)?(?:\s+\d{4})?$/iu.test(title)) return 'named-film-festival';
  return null;
}

/** Compare harmless label variants only after a shared source record has been established. */
export function sourceTitleKey(title: string): string {
  return parseLabel(title).title.replace(/\b(kurzfilm)\s*\(e\)/gi, '$1')
    .replace(/\b(filmreihe)\s*\(n\)/gi, '$1').replace(/\s*\(live\s+action\)/gi, '').trim();
}

/** Interpret only explicit markers. Unknown parentheticals remain part of the title for model/manual review. */
export function parseMarkers(text: string): Modality | null {
  const modality = emptyModality();
  const value = text.trim();
  for (const [pattern, label] of projections) if (pattern.test(value)) { modality.projection = [label]; return modality; }
  if (editions.test(value)) { modality.edition = canonicalEdition(value); return modality; }
  if (contexts.test(value)) { modality.context = [/^q\s*&\s*a$/i.test(value) ? 'Q&A' : value]; return modality; }
  const marker = value.toLowerCase().replace(/[\s.]/g, '');
  if (/^(ov|of|originalversion|originalfassung)$/.test(marker)) modality.version = 'original';
  else if (/^(omu|omü|ovw\/sub)$/.test(marker)) {
    modality.version = 'original'; modality.subtitled = true;
  } else if (/^(omeu|omenglu|omengl[uü]|omüenglu|englischuntertitelt|englishsubtitles)$/.test(marker)) {
    modality.version = 'original'; modality.subtitled = true; modality.subtitleLanguage = 'en';
  } else if (/^(dfmenglu|dfmenglischenu)$/.test(marker)) {
    modality.version = 'dubbed'; modality.spokenLanguage = 'de'; modality.subtitled = true; modality.subtitleLanguage = 'en';
  } else if (/^(df|deutschefassung|synchronisiert|dubbed)$/.test(marker)) {
    modality.version = 'dubbed'; modality.spokenLanguage = 'de';
  } else {
    // Composite markers are accepted only if every part is recognized.
    const protectedText = value.replace(/70\s*mm/gi, '70mm').replace(/35\s*mm/gi, '35mm')
      .replace(/mxp\s*2d/gi, 'MXP2D').replace(/plf\s*2d/gi, 'PLF2D').replace(/imax\s*3d/gi, 'IMAX3D');
    const parts = protectedText.split(/[\s,;/+]+/).filter(Boolean);
    if (parts.length < 2) return null;
    let combined = emptyModality();
    for (const part of parts) {
      const parsed = parseMarkers(part); if (!parsed) return null;
      if (modalityConflict(combined, parsed)) return null;
      combined = combineModality(combined, parsed);
    }
    return combined;
  }
  return modality;
}

export function combineModality(base: Modality, specific: Modality): Modality {
  return {
    version: specific.version === 'unknown' ? base.version : specific.version,
    spokenLanguage: specific.spokenLanguage ?? base.spokenLanguage,
    subtitleLanguage: specific.subtitleLanguage ?? base.subtitleLanguage,
    subtitled: specific.subtitled ?? base.subtitled,
    projection: [...new Set([...base.projection, ...specific.projection])],
    edition: specific.edition ?? base.edition,
    context: [...new Set([...base.context, ...specific.context])],
    unknown: [...new Set([...base.unknown, ...specific.unknown])],
  };
}

export function parseLabel(raw: string, markers: string[] = []): ParsedLabel {
  let modality = emptyModality();
  let year: number | null = null;
  const ambiguous: string[] = [];
  let title = raw.trim().replace(/\s+-\s+Kinoprogramm$/i, '');
  title = title.replace(/\s*\(([^()]*)\)/g, (whole, content: string, offset: number) => {
    // These parentheses are title text. Removing them would lose a word ending or a remake qualifier.
    if (/^live\s+action$/i.test(content.trim())
      || content.trim() === 'e' && /\bkurzfilm\s*$/i.test(title.slice(0, offset))
      || content.trim() === 'n' && /\bfilmreihe\s*$/i.test(title.slice(0, offset))) return whole;
    if (/^(18|19|20)\d{2}$/.test(content.trim())) { year = Number(content.trim()); return ''; }
    const parsed = parseMarkers(content);
    if (parsed) { modality = combineModality(modality, parsed); return ''; }
    ambiguous.push(content.trim()); return whole;
  });
  // Only recognized trailing annotations are removed. Hyphens and punctuation inside names survive.
  const suffix = title.match(/\s+[-–|]\s+([^|]+)$/);
  if (suffix) {
    const parsed = parseMarkers(suffix[1]);
    if (parsed) { title = title.slice(0, suffix.index); modality = combineModality(modality, parsed); }
  }
  const bareFormat = title.match(/\s+(3-?D|2-?D)$/i);
  if (bareFormat) { modality = combineModality(modality, parseMarkers(bareFormat[1])!); title = title.slice(0, bareFormat.index); }
  for (const marker of markers) {
    if (/^(18|19|20)\d{2}$/.test(marker.trim())) { year ??= Number(marker.trim()); continue; }
    const parsed = parseMarkers(marker);
    if (parsed) modality = combineModality(modality, parsed);
    else modality.unknown.push(marker);
  }
  return { title: title.trim() || raw.trim(), alternateTitles: [], year,
    kind: programmeRule(title.trim()) || /\b(?:sneak|kurzfilm(?:programm|e)?|festival|filmreihe|sonderprogramm|opera|ballett|national\s+theatre)\b/i.test(title) ? 'programme' : 'film',
    modality, ambiguous: [...new Set(ambiguous)] };
}

export function modalityTags(modality: Modality): string[] {
  const language = modality.version === 'original'
    ? modality.subtitleLanguage === 'en' ? 'OmeU' : modality.subtitled ? 'OmU' : 'OV'
    : modality.version === 'dubbed' ? modality.subtitleLanguage === 'en' ? 'DFmEnglU' : 'DF' : null;
  return [...new Set([...(language ? [language] : []), ...modality.projection])];
}

export function modalityConflict(a: Modality, b: Modality): boolean {
  const dimensions = (modality: Modality) => modality.projection.flatMap(value => value.match(/\b[23]D\b/gi) ?? []).map(value => value.toUpperCase());
  const gauges = (modality: Modality) => modality.projection.filter(value => /^(35|70)\s*mm$/i.test(value)).map(value => value.toLowerCase().replace(/\s/g, ''));
  const disjoint = (left: string[], right: string[]) => left.length > 0 && right.length > 0 && !left.some(value => right.includes(value));
  return (a.version !== 'unknown' && b.version !== 'unknown' && a.version !== b.version)
    || !!(a.spokenLanguage && b.spokenLanguage && a.spokenLanguage !== b.spokenLanguage)
    || !!(a.subtitleLanguage && b.subtitleLanguage && a.subtitleLanguage !== b.subtitleLanguage)
    || (a.subtitled === false && (b.subtitled === true || !!b.subtitleLanguage))
    || (b.subtitled === false && (a.subtitled === true || !!a.subtitleLanguage))
    || disjoint(dimensions(a), dimensions(b)) || disjoint(gauges(a), gauges(b))
    || !!(a.edition && b.edition && canonicalEdition(a.edition).toLowerCase() !== canonicalEdition(b.edition).toLowerCase());
}
