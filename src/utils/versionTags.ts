import type { Modality } from '../../api/pipeline/domain';
import type { AuditEntity } from '../types/audit';
import { canonicalEdition, combineModality, emptyModality, modalityConflict, modalityTags, parseLabel, parseMarkers } from './screeningLabels';

export type TagCategory = 'Language/version' | 'Projection' | 'Edition' | 'Event' | 'Unrecognized' | 'Unspecified';
interface TagLabel { id: string; label: string; category: TagCategory; description: string }
export interface VersionTag extends TagLabel {
  labels: string[];
  sources: string[];
  confirmed: AuditEntity[];
  reported: AuditEntity[];
  sourceOnly: AuditEntity[];
  movieCount: number;
  cinemaCount: number;
}
const meanings: Record<string, string> = {
  OV: 'Original version. Subtitle presence and language are not specified.',
  OmU: 'Original version with subtitles. Subtitle language is not specified.',
  OmeU: 'Original version with English subtitles.',
  DF: 'German version. This label alone does not distinguish a dub from a German-language original.',
  DFmEnglU: 'German version with English subtitles.',
};
function label(value: string, category: TagCategory): TagLabel {
  return { id: `${category}:${value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()}`, label: value, category,
    description: category === 'Language/version' ? meanings[value] || value
      : category === 'Unrecognized' ? 'Unrecognized source marker; no version or language is inferred.'
      : category === 'Unspecified' ? 'No confirmed screening tags. Source descriptions may still be available.'
      : category === 'Projection' ? 'Explicit projection or cinema format.'
      : category === 'Edition' ? 'Explicit cut, restoration or edition.' : 'Explicit event annotation.' };
}
function modalityLabels(modality: Modality): TagLabel[] {
  const languages = modalityTags({ ...modality, projection: [] }).map(value => label(value, 'Language/version'));
  return [...languages, ...modality.projection.map(value => label(value, 'Projection')),
    ...(modality.edition ? [label(canonicalEdition(modality.edition), 'Edition')] : []), ...modality.context.map(value => label(value, 'Event')),
    ...modality.unknown.map(value => label(value, 'Unrecognized'))];
}
function markers(values: unknown[]): { tags: TagLabel[]; modality: Modality; conflicting: boolean } {
  let modality = emptyModality(); let conflicting = false; const tags: TagLabel[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const parsed = parseMarkers(value);
    if (parsed) { conflicting ||= modalityConflict(modality, parsed); modality = combineModality(modality, parsed); tags.push(...modalityLabels(parsed)); }
    else tags.push(label(value.trim(), 'Unrecognized'));
  }
  return { tags, modality, conflicting };
}

/** Exact explicit markers only; a viewing is counted once per tag, regardless of source/alias count. */
export function versionTagCatalog(records: AuditEntity[]): VersionTag[] {
  const groups = new Map<string, TagLabel & { labels: Set<string>; sources: Set<string>; confirmed: Map<string, AuditEntity>; reported: Map<string, AuditEntity> }>();
  const add = (tag: TagLabel, record: AuditEntity, confirmed: boolean, rawLabel?: string, source?: string) => {
    const group = groups.get(tag.id) ?? { ...tag, labels: new Set<string>(), sources: new Set<string>(),
      confirmed: new Map<string, AuditEntity>(), reported: new Map<string, AuditEntity>() };
    (confirmed ? group.confirmed : group.reported).set(record.id, record);
    if (rawLabel?.trim()) group.labels.add(rawLabel.trim());
    if (source) group.sources.add(source);
    groups.set(tag.id, group);
  };
  for (const record of records) {
    if (record.kind !== 'screening') continue;
    const presentations = record.data.presentations?.length ? record.data.presentations : (record.data.versions ?? [record.data.variants ?? []])
      .map((variants: string[]) => ({ variants }));
    const descriptions = presentations.map((presentation: any) => ({ ...markers(presentation.variants ?? []),
      ...(presentation.modality ? { modality: presentation.modality, tags: modalityLabels(presentation.modality) } : {}) }));
    const conflicting = descriptions.some(description => description.conflicting)
      || descriptions.some((a, i) => descriptions.some((b, j) => j > i && modalityConflict(a.modality, b.modality)));
    let hasConfirmedTag = false;
    for (const description of descriptions) for (const tag of description.tags) {
      const confirmed = !conflicting && tag.category !== 'Unrecognized';
      add(tag, record, confirmed, tag.label); hasConfirmedTag ||= confirmed;
    }
    if (!hasConfirmedTag) add(label('Unspecified', 'Unspecified'), record, true);
    // Alternatives retain contradictory descriptions without treating them as confirmed facts.
    for (const presentation of presentations) for (const alternative of presentation.alternatives ?? [])
      for (const tag of modalityLabels(alternative)) add(tag, record, false);
    for (const [source, history] of Object.entries(record.sources)) {
      const raw = history.details;
      const values = raw.variant != null ? [raw.variant, ...parseLabel(String(raw.rawTitle ?? '')).modality.projection]
        : Array.isArray(raw.movieVariants) && raw.movieVariants.length ? raw.movieVariants
          : Array.isArray(raw.variants) && raw.variants.length ? raw.variants
            : modalityTags(parseLabel(String(raw.rawTitle ?? history.lastName ?? '')).modality);
      for (const value of values) for (const tag of markers([value]).tags) add(tag, record, false, String(value), source);
    }
  }
  return [...groups.values()].map(group => {
    const confirmed = [...group.confirmed.values()], reported = [...group.reported.values()];
    const viewings = new Map([...confirmed, ...reported].map(record => [record.id, record]));
    return { ...group, labels: [...group.labels].sort(), sources: [...group.sources].sort(), confirmed, reported,
      sourceOnly: reported.filter(record => !group.confirmed.has(record.id)),
      movieCount: new Set([...viewings.values()].map(record => record.movieId).filter(Boolean)).size,
      cinemaCount: new Set([...viewings.values()].map(record => record.cinemaId).filter(Boolean)).size };
  }).sort((a, b) => b.confirmed.length - a.confirmed.length || b.reported.length - a.reported.length || a.label.localeCompare(b.label));
}
