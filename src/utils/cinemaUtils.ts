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

export function getCinemaAbbr(name: string): string {
  const skip = new Set(['am', 'an', 'in', 'im', 'der', 'die', 'das', 'de', 'la', 'le', 'bei', 'beim', 'zum', 'zur', 'und', 'the', 'a', 'kino', 'berlin', 'kinowelt']);
  const words = name.split(/[\s\|\-–/]+/).filter(w => w.length > 0);
  const significant = words.filter(w => !skip.has(w.toLowerCase()));
  const parts = significant.slice(0, 3).map(w => w.length > 10 ? w.slice(0, 9) + '.' : w);
  return parts.join(' ') || name.slice(0, 15);
}

export function buildCinemaColors(movie: Movie): Record<string, string> {
  const cinemaColors: Record<string, string> = {};
  let colorIndex = 0;

  const assign = (name: string) => {
    if (!cinemaColors[name]) cinemaColors[name] = cinemaColorClass(colorIndex++);
  };

  if (movie.cinemas && movie.cinemas.length > 0 && (movie.cinemas[0] as any).timeInfo) {
    const allNames = new Set<string>();
    movie.cinemas.forEach(cinema =>
      cinema.showtimes.forEach(showtime => {
        if ((showtime as any).timeInfo) {
          Object.values((showtime as any).timeInfo).forEach((slots: any) =>
            slots.forEach((s: any) => allNames.add(s.cinema))
          );
        }
      })
    );
    Array.from(allNames).sort().forEach(assign);
  } else if (movie.cinemas) {
    movie.cinemas.forEach(cinema => assign(cinema.name));
  }

  return cinemaColors;
}

export function matchesFilters(
  showing: ShowingInfo,
  selectedCinemas: string[],
  selectedVariants: string[]
): boolean {
  const cinemaOk = selectedCinemas.length === 0 || selectedCinemas.includes(showing.cinema);
  const variantOk = selectedVariants.length === 0 || (showing.variant != null && selectedVariants.includes(showing.variant));
  return cinemaOk && variantOk;
}
