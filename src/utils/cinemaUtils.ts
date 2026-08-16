import { Movie, ShowingInfo } from '../types';

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const CINEMA_BADGE_COUNT = 16;

const cinemaColorClass = (index: number) =>
  `cinema-badge cinema-badge-${index % CINEMA_BADGE_COUNT}`;

const SKIP_WORDS = new Set(['am', 'an', 'in', 'im', 'der', 'die', 'das', 'de', 'la', 'le', 'bei', 'beim', 'zum', 'zur', 'und', 'the', 'a', 'kino', 'berlin', 'kinowelt']);

function significantWords(name: string): string[] {
  return name.split(/[\s\|\-–/]+/).filter(w => w.length > 0 && !SKIP_WORDS.has(w.toLowerCase()));
}

export function getCinemaAbbr(name: string): string {
  const sig = significantWords(name);
  if (!sig.length) return name.slice(0, 15);
  const parts = sig.slice(0, 3).map(w => w.length > 10 ? w.slice(0, 9) + '.' : w);
  return parts.join(' ');
}


export function buildCinemaColors(movie: Movie): Record<string, string> {
  const cinemaColors: Record<string, string> = {};
  let colorIndex = 0;

  const assign = (name: string) => {
    if (!cinemaColors[name]) cinemaColors[name] = cinemaColorClass(colorIndex++);
  };

  movie.cinemas.forEach(cinema => assign(cinema.name));

  return cinemaColors;
}

export function matchesFilters(
  showing: ShowingInfo,
  selectedCinemas: string[],
  selectedVariants: string[]
): boolean {
  const cinemaOk = selectedCinemas.includes(showing.cinema);
  const variantOk = selectedVariants.length === 0 || showing.variants.length === 0 || showing.variants.some(v => selectedVariants.includes(v));
  return cinemaOk && variantOk;
}
