/**
 * Parse projection-format markers (3D, 2D, Imax, …) out of scraped titles so
 * "Avatar" and "Avatar (3D)" merge, while 3D showings keep a 3D variant tag.
 */

const FORMAT_LABELS: [RegExp, string][] = [
  [/^mxp\s*2d$/i, 'MXP 2D'],
  [/^imax\s*3d$/i, 'Imax 3D'],
  [/^imax$/i, 'Imax'],
  [/^expn$/i, 'EXPN'],
  [/^mxp$/i, 'MXP'],
  [/^hfr$/i, 'HFR'],
  [/^3-?d$/i, '3D'],
  [/^2-?d$/i, '2D'],
];

const LANGUAGE_LABELS: [RegExp, string][] = [
  [/^ov$/i, 'OV'],
  [/^omu$|^omü$/i, 'OmU'],
  [/^omeu$|^omüu$/i, 'OmeU'],
  [/^ov\s*w\/\s*sub$/i, 'OmU'],
  [/^dfmenglu$|^dfm\s*engl\s*u$/i, 'OmeU'],
];

function classifyToken(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  for (const [re, label] of FORMAT_LABELS) {
    if (re.test(t)) return label;
  }
  for (const [re, label] of LANGUAGE_LABELS) {
    if (re.test(t)) return label;
  }
  return t;
}

function classifyParenContent(content: string): string[] {
  const variants: string[] = [];
  const whole = classifyToken(content);
  if (whole && (FORMAT_LABELS.some(([re]) => re.test(content.trim())) || LANGUAGE_LABELS.some(([re]) => re.test(content.trim())))) {
    return [whole];
  }
  for (const part of content.split(/[\s,/]+/)) {
    const label = classifyToken(part);
    if (label) variants.push(label);
  }
  return variants;
}

function stripTrailingFormatSuffix(title: string): { title: string; variants: string[] } {
  const variants: string[] = [];
  let remaining = title;

  const suffixPatterns: [RegExp, string][] = [
    [/\s*[-–]\s*(3-?d|2-?d|imax)\s*$/i, ''],
    [/\s+(3-?d|2-?d)\s*$/i, ''],
  ];

  for (const [re] of suffixPatterns) {
    const m = remaining.match(re);
    if (!m) continue;
    const label = classifyToken(m[1]);
    if (label) variants.push(label);
    remaining = remaining.replace(re, '').trim();
  }

  return { title: remaining, variants };
}

export interface ParsedTitle {
  baseTitle: string;
  /** Variants extracted from the title itself (3D, Imax, OV, …) */
  titleVariants: string[];
}

export function parseTitle(title: string): ParsedTitle {
  const titleVariants: string[] = [];
  let remaining = title.trim();

  const suffix = stripTrailingFormatSuffix(remaining);
  remaining = suffix.title;
  titleVariants.push(...suffix.variants);

  for (const match of remaining.matchAll(/\(([^)]+)\)/g)) {
    titleVariants.push(...classifyParenContent(match[1]));
  }

  const baseTitle = remaining.replace(/\s*\([^)]*\)/g, '').trim();

  return {
    baseTitle: baseTitle || title.trim(),
    titleVariants: [...new Set(titleVariants)],
  };
}

export function getBaseTitle(title: string): string {
  return parseTitle(title).baseTitle;
}

/** Format-only variants from a title (3D, 2D, Imax, …) — not language codes. */
export function getTitleFormatVariants(title: string): string[] {
  const formatLabels = new Set(FORMAT_LABELS.map(([, label]) => label));
  return parseTitle(title).titleVariants.filter(v => formatLabels.has(v));
}
