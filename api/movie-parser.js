const cheerio = require('cheerio');

class MovieParser {
  constructor(httpClient) {
    this.httpClient = httpClient;
  }

  parseMovies(html) {
    const $ = cheerio.load(html);
    const movieItems = $('.itemContainer');
    const movies = [];

    movieItems.each((i, item) => {
      const $item = $(item);
      const movie = this.parseMovieItem($item, $);
      if (movie) {
        movies.push(movie);
      }
    });

    return movies;
  }

  parseMovieItem($item, $) {
    // Extract title and link
    const titleElement = $item.find('h2 a, h1 a').first();
    const title = titleElement.text().trim();
    const movieUrl = titleElement.attr('href');

    if (!title || !movieUrl) return null;

    // Extract movie details
    const movieDetails = this.extractMovieDetails($item, $);
    
    // Extract variants
    const variants = this.extractVariants(title);
    
    // Extract poster URL
    const posterUrl = this.extractPosterUrl($item);
    
    // Extract cinema and showtime data
    const { cinemas, showings } = this.extractCinemaData($item, $);

    return {
      title: title,
      director: movieDetails.director || null,
      cast: movieDetails.cast ? movieDetails.cast.split(',').map(s => s.trim()) : null,
      country: movieDetails.country || null,
      year: movieDetails.year || null,
      posterUrl: posterUrl || null,
      url: this.httpClient.ensureAbsoluteUrl(movieUrl),
      variants: variants,
      cinemas: cinemas,
      showings: showings
    };
  }

  extractMovieDetails($item, $) {
    const movieDetails = {};
    $item.find('dl.oneline dt, dl.oneline dd').each((j, el) => {
      const $el = $(el);
      if ($el.hasClass('hidden')) return;

      const text = $el.text().trim();
      if (text === 'D:') {
        const director = $el.next('dd').text().trim();
        if (director) movieDetails.director = director;
      } else if (text === 'With:') {
        const cast = $el.next('dd').text().trim();
        if (cast) movieDetails.cast = cast;
      } else if (text === 'Produktion:') {
        const production = $el.next('dd').text().trim();
        if (production) {
          const parts = production.split(' ');
          if (parts.length >= 2) {
            const year = parts[parts.length - 1];
            const countries = parts.slice(0, -1).join(' ');
            movieDetails.country = countries;
            movieDetails.year = year;
          }
        }
      }
    });
    return movieDetails;
  }

  extractVariants(title) {
    const variants = [];
    if (title.includes('(Imax)')) variants.push('Imax');
    else if (title.includes('(EXPN)')) variants.push('EXPN');
    else if (title.includes('(OV w/ sub)')) variants.push('sub');
    else if (title.includes('(OV)')) variants.push('OV');
    return variants;
  }

  extractPosterUrl($item) {
    const posterElement = $item.find('img').first();
    const posterUrl = posterElement.attr('src') || posterElement.attr('data-src');
    return this.httpClient.ensureAbsoluteUrl(posterUrl);
  }

  extractCinemaData($item, $) {
    const movieCinemas = [];
    const movieShowings = [];

    $item.find('article.cinema').each((j, cinemaEl) => {
      const $cinema = $(cinemaEl);
      const cinemaData = this.parseCinema($cinema, $);
      movieCinemas.push(cinemaData.cinema);
      movieShowings.push(...cinemaData.showings);
    });

    return { cinemas: movieCinemas, showings: movieShowings };
  }

  parseCinema($cinema, $) {
    // Extract cinema name and address
    const cinemaLink = $cinema.find('address a').first();
    const cinemaName = cinemaLink.text().trim();
    const cinemaUrl = cinemaLink.attr('href');

    // Extract address
    const addressText = $cinema.find('address').text().trim();
    const address = addressText.replace(cinemaName, '').trim();

    // Parse address components
    const addressParts = address.split(',').map(part => part.trim());
    const streetAddress = addressParts[0] || '';
    const cityPostal = addressParts[1] || '';
    const cityPostalParts = cityPostal.split(' ');
    const postalCode = cityPostalParts[0] || '';
    const city = cityPostalParts.slice(1).join(' ') || 'Berlin';

    const cinema = {
      name: cinemaName,
      address: address
    };

    const showings = this.parseShowings($cinema, cinemaName, address, city, postalCode, cinemaUrl, $);

    return { cinema, showings };
  }

  parseShowings($cinema, cinemaName, address, city, postalCode, cinemaUrl, $) {
    const showings = [];
    const $table = $cinema.find('table.vorstellung');

    if ($table.length > 0) {
      const $headers = $table.find('thead th');
      const $rows = $table.find('tbody tr');

      $rows.each((rowIndex, row) => {
        const $row = $(row);
        const $cells = $row.find('td');

        $cells.each((cellIndex, cell) => {
          const $cell = $(cell);
          const cellText = $cell.text().trim();

          if (cellText && $cell.hasClass('wird_gezeigt')) {
            const dateHeader = $headers.eq(cellIndex).text().trim();
            const parsedDate = this.parseDate(dateHeader);
            const dayOfWeek = this.getDayOfWeek(dateHeader);

            const times = this.parseTimes(cellText);

            times.forEach(time => {
              showings.push({
                date: parsedDate,
                originalDate: dateHeader,
                time: time,
                dayOfWeek: dayOfWeek,
                cinema: cinemaName,
                address: address,
                city: city,
                postalCode: postalCode,
                url: this.httpClient.ensureAbsoluteUrl(cinemaUrl)
              });
            });
          }
        });
      });
    }

    return showings;
  }

  parseTimes(cellText) {
    let times = cellText.split('\n').map(time => time.trim()).filter(time => time);

    if (times.length === 1 && times[0].length > 8) {
      const timePattern = /(\d{1,2}:\d{2})/g;
      const matches = times[0].match(timePattern);
      if (matches && matches.length > 1) {
        times = matches;
      }
    }

    return times.map(time => {
      const timeMatch = time.match(/(\d{1,2}:\d{2})/);
      return timeMatch ? timeMatch[1] : time;
    }).filter(time => time && time.match(/^\d{1,2}:\d{2}$/));
  }

  parseDate(dateStr) {
    if (dateStr === 'Today') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }

    const dateMatch = dateStr.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]);
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day);

      const now = new Date();
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      if (date < oneMonthAgo) {
        date.setFullYear(currentYear + 1);
      }

      return date.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }

  getDayOfWeek(dateStr) {
    if (dateStr === 'Today') return 'Today';

    const dateMatch = dateStr.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]);
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day);

      if (date < new Date()) {
        date.setFullYear(currentYear + 1);
      }

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return dayNames[date.getDay()];
    }

    return dateStr;
  }
}

module.exports = MovieParser;
