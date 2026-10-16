import { parseLabel, modalityTags } from './pipeline/labels';

export interface ParsedTitle { baseTitle: string; titleVariants: string[] }
/** Source-adapter compatibility. Ambiguous title text is retained for central interpretation. */
export function parseTitle(title: string): ParsedTitle {
  const parsed = parseLabel(title);
  return { baseTitle: parsed.title, titleVariants: modalityTags(parsed.modality) };
}
export function getBaseTitle(title: string): string { return parseLabel(title).title; }
export function getTitleFormatVariants(title: string): string[] { return parseLabel(title).modality.projection; }
