// Comparison keys only: original source labels must remain unchanged for display and audit.
const latinEquivalents: Readonly<Record<string, string>> = {
  'ß': 'ss', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'þ': 'th',
  'æ': 'ae', 'œ': 'oe', 'ħ': 'h', 'ŧ': 't', 'ŋ': 'ng', 'ƒ': 'f',
};

/** Fold common Latin transliterations without deleting other writing systems or sequel numbers. */
export function normalizeComparisonText(value: string): string {
  return value.normalize('NFKD')
    // Remove accents attached to Latin letters; vowel marks in other scripts can change the word.
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1').toLowerCase()
    .replace(/[ßıłøđðþæœħŧŋƒ]/g, letter => latinEquivalents[letter])
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}

/** Whole-person comparison: join punctuation inside names, then tolerate surname-first credit order. */
export function normalizePersonComparison(value: string): string {
  return normalizeComparisonText(value.replace(/(\p{L})[-\u2010-\u2015'\u2019\u02bc](?=\p{L})/gu, '$1'))
    .split(' ').filter(Boolean).sort().join(' ');
}
