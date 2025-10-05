class MovieMerger {
  static mergeMovies(movies) {
    const movieMap = new Map();

    movies.forEach(movie => {
      const baseTitle = this.getBaseTitle(movie.title);

      if (!movieMap.has(baseTitle)) {
        const mergedMovie = {
          title: baseTitle,
          director: movie.director,
          cast: movie.cast,
          country: movie.country,
          year: movie.year,
          posterUrl: movie.posterUrl,
          url: movie.url,
          variants: new Set(),
          cinemas: new Set(),
          showings: {}
        };
        movieMap.set(baseTitle, mergedMovie);
      }

      const mergedMovie = movieMap.get(baseTitle);

      // Merge variants
      if (movie.variants) {
        movie.variants.forEach(variant => mergedMovie.variants.add(variant));
      }

      // Merge cinemas
      if (movie.cinemas) {
        movie.cinemas.forEach(cinema => {
          mergedMovie.cinemas.add(JSON.stringify(cinema));
        });
      }

      // Merge showings
      if (movie.showings && Array.isArray(movie.showings)) {
        movie.showings.forEach(showing => {
          this.mergeShowing(mergedMovie, showing, movie.variants);
        });
      }
    });

    return Array.from(movieMap.values()).map(movie => {
      const sortedShowings = this.sortShowings(movie.showings);
      return {
        ...movie,
        variants: Array.from(movie.variants),
        cinemas: Array.from(movie.cinemas).map(cinemaStr => JSON.parse(cinemaStr)),
        showings: sortedShowings
      };
    });
  }

  static getBaseTitle(title) {
    return title.replace(/\s*\([^)]*\)/g, '').trim();
  }

  static mergeShowing(mergedMovie, showing, movieVariants) {
    let formattedDate = this.formatDate(showing);
    const formattedTime = showing.time;
    const variant = this.determineVariant(movieVariants);

    if (!mergedMovie.showings[formattedDate]) {
      mergedMovie.showings[formattedDate] = {};
    }

    if (!mergedMovie.showings[formattedDate][formattedTime]) {
      mergedMovie.showings[formattedDate][formattedTime] = [];
    }

    const showingInfo = {
      cinema: showing.cinema,
      variant: variant
    };

    const exists = mergedMovie.showings[formattedDate][formattedTime].some(s =>
      s.cinema === showingInfo.cinema && s.variant === showingInfo.variant
    );

    if (!exists) {
      mergedMovie.showings[formattedDate][formattedTime].push(showingInfo);
    }
  }

  static formatDate(showing) {
    if (showing.originalDate === 'Today') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }

    const date = new Date(showing.date);
    if (isNaN(date.getTime())) {
      const dateMatch = showing.originalDate.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[2]);
        const month = parseInt(dateMatch[3]);
        const currentYear = new Date().getFullYear();
        const parsedDate = new Date(currentYear, month - 1, day);

        const now = new Date();
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        if (parsedDate < oneMonthAgo) {
          parsedDate.setFullYear(currentYear + 1);
        }

        return parsedDate.toISOString().split('T')[0];
      } else {
        return showing.originalDate;
      }
    } else {
      return date.toISOString().split('T')[0];
    }
  }

  static determineVariant(movieVariants) {
    if (movieVariants && movieVariants.length > 0) {
      if (movieVariants.includes('OV')) return 'OV';
      else if (movieVariants.includes('sub')) return 'sub';
      else if (movieVariants.includes('Imax')) return 'Imax';
      else if (movieVariants.includes('EXPN')) return 'EXPN';
      else return movieVariants[0];
    }
    return null;
  }

  static sortShowings(showings) {
    const sortedShowings = {};
    Object.keys(showings)
      .sort((a, b) => a.localeCompare(b))
      .forEach(date => {
        sortedShowings[date] = {};
        Object.keys(showings[date])
          .sort((a, b) => a.localeCompare(b))
          .forEach(time => {
            sortedShowings[date][time] = showings[date][time];
          });
      });
    return sortedShowings;
  }
}

module.exports = MovieMerger;
