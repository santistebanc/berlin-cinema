const has = (variants: string[], name: string) =>
  variants.some((v) => v.toLowerCase() === name.toLowerCase());

const hasSubstring = (variants: string[], needle: string) =>
  variants.some((v) => v.toLowerCase().includes(needle.toLowerCase()));

/**
 * Up to 3 tags for a movie card, in precedence order:
 * 1. OV, else OmU, else OmeU
 * 2. 3D (any variant mentioning 3D)
 * 3. Imax (any variant mentioning Imax)
 */
export function getCardTags(variants: string[]): string[] {
  const tags: string[] = [];

  if (has(variants, 'OV')) tags.push('OV');
  else if (has(variants, 'OmU')) tags.push('OmU');
  else if (has(variants, 'OmeU')) tags.push('OmeU');

  if (hasSubstring(variants, '3D')) tags.push('3D');
  if (hasSubstring(variants, 'Imax')) tags.push('Imax');

  return tags.slice(0, 3);
}
