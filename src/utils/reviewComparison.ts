import type { ReviewColumn } from '../types/review';

export function comparisonValue(value: any, field?: string): string {
  if (field === 'locationConfidence' && typeof value === 'number') return `${(value * 100).toFixed(1)}%`;
  if (Array.isArray(value) && ['spokenLanguages', 'productionCountries', 'productionCompanies'].includes(field ?? ''))
    return value.map(item => typeof item === 'string' ? item : item.name || item.code).filter(Boolean).join(', ');
  if (Array.isArray(value) && field === 'certifications') return value.map(item => `${item.country}: ${item.certification}`).join(', ');
  if (['spokenLanguage', 'subtitleLanguage', 'originalLanguage'].includes(field ?? '') && typeof value === 'string') {
    try { return new (Intl as any).DisplayNames(['en'], { type: 'language' }).of(value) || value; } catch { return value; }
  }
  if (field === 'version') return ({ original: 'Original', dubbed: 'Dubbed', unknown: 'Not specified' } as Record<string, string>)[value] || String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(item => comparisonValue(item, field)).join(', ');
  if (value && typeof value === 'object' && typeof value.source === 'string' && typeof value.value === 'string') return `${value.source}: ${value.value}`;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}
function comparable(value: any): string {
  if (Array.isArray(value)) return value.map(comparable).sort().join('|');
  return comparisonValue(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function sourcePageLabel(value: string): string {
  try {
    const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean);
    const label = parts.slice(parts[parts.length - 2]?.endsWith('.php') ? -2 : -1).join('/');
    return `${url.hostname.replace(/^www\./, '')} / ${label || url.pathname}`;
  } catch { return value; }
}

export function comparisonStatus(key: string, columns: ReviewColumn[]): 'conflict' | 'different' | 'missing' | 'same' | 'empty' {
  const sets = columns.map(column => [...new Set((key === 'subtitleLanguage' && column.fields.subtitled?.[0] === false
    ? ['No subtitles'] : column.fields[key] ?? []).map(comparable).filter(Boolean))]);
  const values = new Set(sets.flat());
  if (!values.size) return 'empty';
  if (values.size > 1) return key === 'sourceFilmUrl' ? 'different' : 'conflict';
  return sets.some(values => !values.length) ? 'missing' : 'same';
}

export function screeningSubtitles(column: ReviewColumn): string {
  const languages = column.fields.subtitleLanguage ?? [];
  const description = column.fields.subtitled?.[0] === false ? 'No subtitles' : languages.length
    ? languages.map(value => comparisonValue(value, 'subtitleLanguage')).join(', ')
    : column.fields.subtitled?.[0] === true ? 'Language unspecified' : 'Not specified';
  const marker = column.fields.variant?.[0];
  return marker ? `${description} (${marker})` : description;
}
