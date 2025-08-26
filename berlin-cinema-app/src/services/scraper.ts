import * as cheerio from 'cheerio';
import axios from 'axios';
import { Movie, Cinema, Showtime, ScrapingResult, CinemaInfo } from '../types/scraper';

type CheerioElement = any;

export class BerlinCinemaScraper {
  private cache: { data: ScrapingResult | null; lastFetched: Date | null } = {
    data: null,
    lastFetched: null
  };

  private isCacheValid(): boolean {
    if (!this.cache.lastFetched) return false;
    const now = new Date();
    const lastFetched = this.cache.lastFetched;
    return now.getDate() === lastFetched.getDate() && 
           now.getMonth() === lastFetched.getMonth() && 
           now.getFullYear() === lastFetched.getFullYear();
  }

  async scrapeMovies(): Promise<ScrapingResult> {
    // Check cache first
    if (this.isCacheValid() && this.cache.data) {
      return this.cache.data;
    }

    try {
      const response = await axios.get('https://www.critic.de/ov-movies-berlin/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 30000
      });

      const $ = cheerio.load(response.data);
      const movies: Movie[] = [];
      const cinemas: CinemaInfo[] = [];
      const cinemaMap = new Map<string, CinemaInfo>();

      // Extract movies
      $('.itemContainer').each((_, element: CheerioElement) => {
        const movieId = $(element).attr('data-movie_id');
        const title = $(element).find('h2 a').text().trim();
        const language = $(element).attr('data-search_of_value') || '';
        const year = $(element).find('.oneline dd.not_bold').first().text().trim();
        const country = $(element).find('.oneline dd.not_bold').first().text().trim();
        const director = $(element).find('.oneline dd').eq(1).text().trim();
        const cast = $(element).find('.oneline dd').eq(2).text().trim().split(',').map(s => s.trim()).filter(Boolean);
        const fsk = $(element).attr('data-search_fsk_value') || '';
        const imageUrl = $(element).find('figure img').attr('src');
        const trailerUrl = $(element).find('.subfilminfo.trailer a').attr('href');
        const reviewUrl = $(element).find('.subfilminfo.critic a').attr('href');

        if (movieId && title) {
          const movie: Movie = {
            id: movieId,
            title,
            language,
            year,
            country,
            director,
            cast,
            fsk,
            imageUrl,
            trailerUrl,
            reviewUrl,
            cinemas: [],
            variants: []
          };

          // Extract cinema information
          $(element).find('article.cinema').each((_, cinemaElement: CheerioElement) => {
            const cinemaName = $(cinemaElement).find('address a').text().trim();
            const cinemaAddress = $(cinemaElement).find('address').text().trim().replace(cinemaName, '').trim();
            const cinemaUrl = $(cinemaElement).find('address a').attr('href');
            
            // Generate a unique ID for the cinema
            const cinemaId = `cinema_${cinemaName.replace(/\s+/g, '_').toLowerCase()}`;

            if (cinemaName) {
              // Add cinema to global list if not exists
              if (!cinemaMap.has(cinemaId)) {
                const cinemaInfo: CinemaInfo = {
                  id: cinemaId,
                  name: cinemaName,
                  address: cinemaAddress,
                  city: 'Berlin',
                  postalCode: '',
                  url: cinemaUrl
                };
                cinemaMap.set(cinemaId, cinemaInfo);
                cinemas.push(cinemaInfo);
              }

              // Extract showtimes for this cinema
              const showtimes: Showtime[] = [];
              $(cinemaElement).find('table.vorstellung tbody tr td.wird_gezeigt').each((_, showtimeElement: CheerioElement) => {
                const time = $(showtimeElement).text().trim();
                const columnIndex = $(showtimeElement).index();
                const headerRow = $(cinemaElement).find('table.vorstellung thead tr th');
                const date = headerRow.eq(columnIndex).text().trim();

                if (date && time) {
                  showtimes.push({
                    date,
                    time,
                    language: language,
                    variants: []
                  });
                }
              });

              // Add cinema with showtimes to movie
              const cinema: Cinema = {
                id: cinemaId,
                name: cinemaName,
                address: cinemaAddress,
                city: 'Berlin',
                postalCode: '',
                url: cinemaUrl,
                showtimes
              };

              movie.cinemas.push(cinema);
            }
          });

          movies.push(movie);
        }
      });

      const result: ScrapingResult = {
        movies,
        cinemas: Array.from(cinemaMap.values()),
        lastUpdated: new Date().toISOString()
      };

      // Update cache
      this.cache.data = result;
      this.cache.lastFetched = new Date();

      return result;
    } catch (error) {
      console.error('Error scraping movies:', error);
      throw new Error(`Failed to scrape movies: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  clearCache(): void {
    this.cache.data = null;
    this.cache.lastFetched = null;
  }

  getCacheStatus(): { hasData: boolean; lastFetched: string | null; isValid: boolean } {
    return {
      hasData: !!this.cache.data,
      lastFetched: this.cache.lastFetched?.toISOString() || null,
      isValid: this.isCacheValid()
    };
  }
}
