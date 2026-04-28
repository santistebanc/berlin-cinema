import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Entity alias map — loaded from entities.json at module init
// ---------------------------------------------------------------------------

const ENTITIES_PATH = path.join(__dirname, 'entities.json');
const entities: { cinemas: { canonical: string; aliases: string[] }[] } =
  JSON.parse(fs.readFileSync(ENTITIES_PATH, 'utf-8'));

function normalizeCinemaName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[!.\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// normalizedAlias → canonicalName (canonical names map to themselves)
const CINEMA_ALIAS_MAP = new Map<string, string>();
for (const entry of entities.cinemas) {
  CINEMA_ALIAS_MAP.set(normalizeCinemaName(entry.canonical), entry.canonical);
  for (const alias of entry.aliases) {
    CINEMA_ALIAS_MAP.set(normalizeCinemaName(alias), entry.canonical);
  }
}

function resolveAlias(name: string): string {
  return CINEMA_ALIAS_MAP.get(normalizeCinemaName(name)) ?? name;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Showing {
  date: string;
  originalDate: string;
  time: string;
  dayOfWeek: string;
  cinema: string;
  address: string;
  city: string;
  postalCode: string;
  url: string | undefined;
  variant?: string | null; // per-showing variant (berlin.de), overrides movieVariants
}

interface Cinema {
  name: string;
  address: string;
  city?: string;
  postalCode?: string;
  url?: string;
}

interface RawMovie {
  title: string;
  criticTitle: string | null;
  altTitle: string | null;
  director: string | null;
  cast: string[] | null;
  country: string | null;
  year: string | null;
  posterUrl: string | null;
  url: string | null;
  variants: string[];
  cinemas: Cinema[];
  showings: Showing[];
}

interface ShowingInfo {
  cinema: string;
  variant: string | null;
}

interface MergedMovieInternal {
  title: string;
  criticTitle: string | null;
  altTitle: string | null;
  director: string | null;
  cast: string[] | null;
  country: string | null;
  year: number | null;
  posterUrl: string | null;
  url: string | null;
  variants: Set<string>;
  cinemas: Map<string, Cinema>;
  // normalizedName → canonical cinema map key
  cinemaNameIndex: Map<string, string>;
  showings: Record<string, Record<string, ShowingInfo[]>>;
  sourceTitles: Set<string>;
}

// ---------------------------------------------------------------------------
// MovieMerger
// ---------------------------------------------------------------------------

class MovieMerger {
  static mergeMovies(movies: RawMovie[]): { movies: any[]; newCinemas: string[] } {
    const movieMap = new Map<string, MergedMovieInternal>();
    // Cinemas that were not resolved via the entity alias map — potential new entities
    const newCinemas = new Set<string>();

    movies.forEach(movie => {
      const baseTitle = this.getBaseTitle(movie.title);

      if (!movieMap.has(baseTitle)) {
        movieMap.set(baseTitle, {
          title: baseTitle,
          criticTitle: movie.criticTitle ?? null,
          altTitle: movie.altTitle ?? null,
          director: movie.director,
          cast: movie.cast,
          country: movie.country,
          year: movie.year ? parseInt(movie.year) : null,
          posterUrl: movie.posterUrl,
          url: movie.url,
          variants: new Set(),
          cinemas: new Map(),
          cinemaNameIndex: new Map(),
          showings: {},
          sourceTitles: new Set(),
        });
      }

      const mergedMovie = movieMap.get(baseTitle)!;
      mergedMovie.sourceTitles.add(movie.title);

      // Prefer critic.de metadata (non-null url containing /movie/ signals critic.de)
      if (movie.url?.includes('/movie/')) {
        if (!mergedMovie.url?.includes('/movie/')) {
          mergedMovie.url = movie.url;
          if (movie.criticTitle) mergedMovie.criticTitle = movie.criticTitle;
          if (movie.altTitle) mergedMovie.altTitle = movie.altTitle;
          if (movie.director) mergedMovie.director = movie.director;
          if (movie.cast) mergedMovie.cast = movie.cast;
          if (movie.country) mergedMovie.country = movie.country;
          if (movie.year) mergedMovie.year = parseInt(movie.year);
          if (movie.posterUrl) mergedMovie.posterUrl = movie.posterUrl;
        }
      }

      if (movie.variants) {
        movie.variants.forEach(v => mergedMovie.variants.add(v));
      }

      if (movie.cinemas) {
        movie.cinemas.forEach(cinema => {
          const wasNew = this.mergeCinema(mergedMovie, cinema);
          if (wasNew && !CINEMA_ALIAS_MAP.has(normalizeCinemaName(cinema.name))) {
            newCinemas.add(cinema.name);
          }
        });
      }

      if (movie.showings && Array.isArray(movie.showings)) {
        movie.showings.forEach(showing => {
          // Resolve showing cinema via index (which has both original and canonical norms)
          const resolvedName = this.resolveCinemaFromIndex(mergedMovie.cinemaNameIndex, showing.cinema);
          const resolvedShowing = resolvedName !== showing.cinema ? { ...showing, cinema: resolvedName } : showing;
          this.mergeShowing(mergedMovie, resolvedShowing, movie.variants);
        });
      }
    });

    const mergedMovies = Array.from(movieMap.values()).map(({ cinemaNameIndex: _idx, ...movie }) => ({
      ...movie,
      variants: Array.from(movie.variants),
      cinemas: Array.from(movie.cinemas.values()),
      showings: this.sortShowings(movie.showings),
      sourceTitles: Array.from(movie.sourceTitles),
      criticTitle: movie.criticTitle,
      altTitle: movie.altTitle,
      plot: null,
      runtime: null,
      rating: null,
      genres: null,
      originalLanguage: null,
      tmdbFetched: false,
    }));

    return { movies: mergedMovies, newCinemas: Array.from(newCinemas) };
  }

  /**
   * Merge a cinema into the movie, resolving via entity alias map then normalization.
   * Returns true if this is a brand-new cinema entry (not seen before for this movie).
   */
  static mergeCinema(mergedMovie: MergedMovieInternal, cinema: Cinema): boolean {
    // Resolve via entity alias → get canonical name (or original if no alias)
    const resolvedName = resolveAlias(cinema.name);
    const resolvedNorm = normalizeCinemaName(resolvedName);

    // Check if canonical already exists in the index
    const existingKey = mergedMovie.cinemaNameIndex.get(resolvedNorm);
    if (existingKey) {
      // Cinema already present — update address if we now have one
      const existing = mergedMovie.cinemas.get(existingKey)!;
      if (!existing.address && cinema.address) {
        mergedMovie.cinemas.set(existingKey, { ...cinema, name: existing.name });
      }
      // Register original norm → same canonical so showing lookups work
      const origNorm = normalizeCinemaName(cinema.name);
      if (!mergedMovie.cinemaNameIndex.has(origNorm)) {
        mergedMovie.cinemaNameIndex.set(origNorm, existingKey);
      }
      return false;
    }

    // New cinema — add under resolved (canonical) name
    const canonicalCinema: Cinema = { ...cinema, name: resolvedName };
    mergedMovie.cinemas.set(resolvedName, canonicalCinema);
    mergedMovie.cinemaNameIndex.set(resolvedNorm, resolvedName);

    // Also index the original name if it differs, so showings referencing it resolve correctly
    const origNorm = normalizeCinemaName(cinema.name);
    if (origNorm !== resolvedNorm) {
      mergedMovie.cinemaNameIndex.set(origNorm, resolvedName);
    }

    return true;
  }

  static resolveCinemaFromIndex(index: Map<string, string>, name: string): string {
    const norm = normalizeCinemaName(name);
    return index.get(norm) ?? name;
  }

  static getBaseTitle(title: string): string {
    return title.replace(/\s*\([^)]*\)/g, '').trim();
  }

  static mergeShowing(mergedMovie: MergedMovieInternal, showing: Showing, movieVariants: string[]): void {
    const formattedDate = this.formatDate(showing);
    const formattedTime = showing.time;
    // null variant → inherit from movie's declared variants (e.g. berlin.de unannotated times)
    const variant = (showing.variant != null) ? showing.variant : this.determineVariant(movieVariants);

    if (!mergedMovie.showings[formattedDate]) {
      mergedMovie.showings[formattedDate] = {};
    }
    if (!mergedMovie.showings[formattedDate][formattedTime]) {
      mergedMovie.showings[formattedDate][formattedTime] = [];
    }

    const showingInfo: ShowingInfo = { cinema: showing.cinema, variant };
    const exists = mergedMovie.showings[formattedDate][formattedTime].some(
      s => s.cinema === showingInfo.cinema && s.variant === showingInfo.variant
    );

    if (!exists) {
      mergedMovie.showings[formattedDate][formattedTime].push(showingInfo);
    }
  }

  static formatDate(showing: Showing): string {
    if (showing.originalDate === 'Today') {
      return new Date().toISOString().split('T')[0];
    }

    const date = new Date(showing.date);
    if (isNaN(date.getTime())) {
      const dateMatch = showing.originalDate.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[2]);
        const month = parseInt(dateMatch[3]);
        const currentYear = new Date().getUTCFullYear();
        const ts = Date.UTC(currentYear, month - 1, day);
        const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const finalTs = ts < oneMonthAgo ? Date.UTC(currentYear + 1, month - 1, day) : ts;
        return new Date(finalTs).toISOString().split('T')[0];
      }
      return showing.originalDate;
    }

    return date.toISOString().split('T')[0];
  }

  static determineVariant(movieVariants: string[]): string | null {
    if (movieVariants && movieVariants.length > 0) {
      if (movieVariants.includes('OV')) return 'OV';
      if (movieVariants.includes('OmU')) return 'OmU';
      if (movieVariants.includes('Imax')) return 'Imax';
      if (movieVariants.includes('EXPN')) return 'EXPN';
      return movieVariants[0];
    }
    return null;
  }

  static sortShowings(showings: Record<string, Record<string, ShowingInfo[]>>) {
    const sorted: Record<string, Record<string, ShowingInfo[]>> = {};
    Object.keys(showings)
      .sort((a, b) => a.localeCompare(b))
      .forEach(date => {
        sorted[date] = {};
        Object.keys(showings[date])
          .sort((a, b) => a.localeCompare(b))
          .forEach(time => {
            sorted[date][time] = showings[date][time];
          });
      });
    return sorted;
  }
}

export default MovieMerger;
