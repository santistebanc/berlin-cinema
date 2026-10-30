import { normalizeComparisonText } from './text-normalization';

/** Bounded query expansion, never permission to identify a film by a shortened title. */
export function filmSearchTitles(titles: string[]): string[] {
  const originals = [...new Set(titles.filter(Boolean))];
  const extra = originals.flatMap(title => {
    if (/\s\+\s|\bdouble\s+(?:feature|bill)\b/i.test(title)) return [];
    const presentation = title.replace(/\s*:\s*live\s+viewing\s*$/i, '')
      .replace(/\s+encore\s+(?:19|20)\d{2}\s*$/i, '');
    const parts = presentation.split(/\s+[-–—]\s+/);
    const descriptive = parts.length === 2 && parts[0].split(/\s+/).length >= 3
      && parts[1].split(/\s+/).length >= 5 && !/\d/.test(parts[1]) ? [parts[0]] : [];
    return [...(presentation !== title ? [presentation] : []), ...descriptive];
  });
  return [...new Set([...originals, ...extra])].slice(0, 3);
}

/** Explicit presentation suffixes and an omitted English article leave the work's title intact. */
export function filmTitleKeys(title: string): string[] {
  const key = normalizeComparisonText(title.replace(/\s*:\s*live\s+viewing\s*$/i, ''));
  return [...new Set([key, key.replace(/^the\s+/, '')])].filter(Boolean);
}
