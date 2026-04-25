import * as cheerio from 'cheerio';
import HttpClient from './http-client';

class MovieParser {
  private httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  parseMovies(html: string) {
    const $ = cheerio.load(html);
    const movies: any[] = [];

    $('.itemContainer').each((_: number, item: any) => {
      const movie = this.parseMovieItem($(item), $);
      if (movie) movies.push(movie);
    });

    return movies;
  }

  parseMovieItem($item: any, $: any) {
    const titleElement = $item.find('h2 a, h1 a').first();
    const titleAttr = titleElement.attr('title');
    const displayTitle = titleElement.text().trim();
    // Title attribute format: "Original Title (OmU) - Kinoprogramm"
    // Strip the suffix and the trailing variant in parens to get the clean title
    const rawTitle = titleAttr
      ? titleAttr.replace(/\s+-\s+Kinoprogramm$/, '').replace(/\s*\([^)]*\)\s*$/, '')
      : displayTitle.replace(/\s*\([^)]*\)\s*$/, '');
    const title = rawTitle.trim();
    // Keep the inner text (English display title) as a search alias
    const criticTitle = displayTitle.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const movieUrl = titleElement.attr('href');

    if (!title || !movieUrl) return null;

    const movieDetails = this.extractMovieDetails($item, $);
    // Extract variants from the display text — it uses English codes like "(OV w/ sub)"
    const variants = this.extractVariants(displayTitle);
    const posterUrl = this.extractPosterUrl($item);
    const { cinemas, showings } = this.extractCinemaData($item, $);

    return {
      title,
      criticTitle: criticTitle !== title ? criticTitle : null,
      director: movieDetails.director || null,
      cast: movieDetails.cast ? movieDetails.cast.split(',').map((s: string) => s.trim()) : null,
      country: movieDetails.country || null,
      year: movieDetails.year || null,
      posterUrl: posterUrl || null,
      url: this.httpClient.ensureAbsoluteUrl(movieUrl),
      variants,
      cinemas,
      showings
    };
  }

  extractMovieDetails($item: any, $: any) {
    const details: Record<string, string> = {};
    $item.find('dl.oneline dt, dl.oneline dd').each((_: number, el: any) => {
      const $el = $(el);
      if ($el.hasClass('hidden')) return;
      const text = $el.text().trim();
      if (text === 'D:') {
        const director = $el.next('dd').text().trim();
        if (director) details.director = director;
      } else if (text === 'With:') {
        const cast = $el.next('dd').text().trim();
        if (cast) details.cast = cast;
      } else if (text === 'Produktion:') {
        const production = $el.next('dd').text().trim();
        if (production) {
          const parts = production.split(' ');
          if (parts.length >= 2) {
            details.year = parts[parts.length - 1];
            details.country = parts.slice(0, -1).join(' ');
          }
        }
      }
    });
    return details;
  }

  extractVariants(title: string): string[] {
    const variants: string[] = [];
    if (title.includes('(Imax)')) variants.push('Imax');
    else if (title.includes('(EXPN)')) variants.push('EXPN');
    else if (title.includes('(OV w/ sub)')) variants.push('sub');
    else if (title.includes('(OV)')) variants.push('OV');
    return variants;
  }

  extractPosterUrl($item: any): string | undefined {
    const el = $item.find('img').first();
    const url = el.attr('src') || el.attr('data-src');
    return this.httpClient.ensureAbsoluteUrl(url);
  }

  extractCinemaData($item: any, $: any) {
    const cinemas: { name: string; address: string }[] = [];
    const showings: any[] = [];

    $item.find('article.cinema').each((_: number, cinemaEl: any) => {
      const data = this.parseCinema($(cinemaEl), $);
      cinemas.push(data.cinema);
      showings.push(...data.showings);
    });

    return { cinemas, showings };
  }

  parseCinema($cinema: any, $: any) {
    const cinemaLink = $cinema.find('address a').first();
    const cinemaName = cinemaLink.text().trim();
    const cinemaUrl = cinemaLink.attr('href');

    const addressText = $cinema.find('address').text().trim();
    const address = addressText.replace(cinemaName, '').trim();

    const addressParts = address.split(',').map((p: string) => p.trim());
    const cityPostalParts = (addressParts[1] || '').split(' ');
    const postalCode = cityPostalParts[0] || '';
    const city = cityPostalParts.slice(1).join(' ') || 'Berlin';

    const cinema = { name: cinemaName, address };
    const showings = this.parseShowings($cinema, cinemaName, address, city, postalCode, cinemaUrl, $);

    return { cinema, showings };
  }

  parseShowings(
    $cinema: any, cinemaName: string, address: string,
    city: string, postalCode: string, cinemaUrl: string | undefined, $: any
  ) {
    const showings: any[] = [];
    const $table = $cinema.find('table.vorstellung');
    if ($table.length === 0) return showings;

    const $headers = $table.find('thead th');
    $table.find('tbody tr').each((_: number, row: any) => {
      $(row).find('td').each((cellIndex: number, cell: any) => {
        const $cell = $(cell);
        const cellText = $cell.text().trim();
        if (cellText && $cell.hasClass('wird_gezeigt')) {
          const dateHeader = $headers.eq(cellIndex).text().trim();
          const parsedDate = this.parseDate(dateHeader);
          const dayOfWeek = this.getDayOfWeek(dateHeader);
          const times = this.parseTimes(cellText);

          times.forEach(time => {
            showings.push({
              date: parsedDate, originalDate: dateHeader, time, dayOfWeek,
              cinema: cinemaName, address, city, postalCode,
              url: this.httpClient.ensureAbsoluteUrl(cinemaUrl)
            });
          });
        }
      });
    });

    return showings;
  }

  parseTimes(cellText: string): string[] {
    let times = cellText.split('\n').map(t => t.trim()).filter(Boolean);

    if (times.length === 1 && times[0].length > 8) {
      const matches = times[0].match(/(\d{1,2}:\d{2})/g);
      if (matches && matches.length > 1) times = matches;
    }

    return times.map(time => {
      const m = time.match(/(\d{1,2}:\d{2})/);
      return m ? m[1] : time;
    }).filter(t => /^\d{1,2}:\d{2}$/.test(t));
  }

  parseDate(dateStr: string): string {
    if (dateStr === 'Today') return new Date().toISOString().split('T')[0];

    const dateMatch = dateStr.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]);
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day);
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      if (date < oneMonthAgo) date.setFullYear(currentYear + 1);
      return date.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }

  getDayOfWeek(dateStr: string): string {
    if (dateStr === 'Today') return 'Today';

    const dateMatch = dateStr.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]);
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day);
      if (date < new Date()) date.setFullYear(currentYear + 1);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return dayNames[date.getDay()];
    }

    return dateStr;
  }
}

export default MovieParser;
