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
  showings: Record<string, Record<string, ShowingInfo[]>>;
  sourceTitles: Set<string>;
}

class MovieMerger {
  static mergeMovies(movies: RawMovie[]): any[] {
    const movieMap = new Map<string, MergedMovieInternal>();

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
          const existing = mergedMovie.cinemas.get(cinema.name);
          // Prefer entry with more data (non-empty address)
          if (!existing || (!existing.address && cinema.address)) {
            mergedMovie.cinemas.set(cinema.name, cinema);
          }
        });
      }

      if (movie.showings && Array.isArray(movie.showings)) {
        movie.showings.forEach(showing => {
          this.mergeShowing(mergedMovie, showing, movie.variants);
        });
      }
    });

    return Array.from(movieMap.values()).map(movie => ({
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
  }

  static getBaseTitle(title: string): string {
    return title.replace(/\s*\([^)]*\)/g, '').trim();
  }

  static mergeShowing(mergedMovie: MergedMovieInternal, showing: Showing, movieVariants: string[]): void {
    const formattedDate = this.formatDate(showing);
    const formattedTime = showing.time;
    const variant = showing.variant !== undefined ? showing.variant : this.determineVariant(movieVariants);

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
        const currentYear = new Date().getFullYear();
        const parsedDate = new Date(currentYear, month - 1, day);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        if (parsedDate < oneMonthAgo) parsedDate.setFullYear(currentYear + 1);
        return parsedDate.toISOString().split('T')[0];
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
