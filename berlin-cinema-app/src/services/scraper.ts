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
      const response = await axios.post('https://www.critic.de/ov-movies-berlin/', 
        'tx_criticde_pi5%5Bovsearch_cinema%5D=&tx_criticde_pi5%5Bovsearch_cinema_show%5D=&ovsearch_movie_ajax=&tx_criticde_pi5%5Bovsearch_movie%5D=&tx_criticde_pi5%5Bovsearch_district%5D=&tx_criticde_pi5%5Bovsearch_date%5D=&tx_criticde_pi5%5Bovsearch_of%5D=1&tx_criticde_pi5%5Bovsearch_omu%5D=1&tx_criticde_pi5%5Bsubmit_button%5D=search&tx_criticde_pi5%5Bsubmit%5D=&tx_criticde_pi5%5Bovsearch_days%5D=',
        {
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language': 'en-GB,en;q=0.5',
            'cache-control': 'no-cache',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://www.critic.de',
            'pragma': 'no-cache',
            'referer': 'https://www.critic.de/ov-movies-berlin/',
            'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-user': '?1',
            'sec-gpc': '1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
          },
          timeout: 30000
        }
      );

      const $ = cheerio.load(response.data);
      const movies: Movie[] = [];
      const cinemas: CinemaInfo[] = [];
      const cinemaMap = new Map<string, CinemaInfo>();

      // Extract movies
      $('.itemContainer').each((_, element: CheerioElement) => {
        const movieId = $(element).attr('data-movie_id');
        const title = $(element).find('.itemTitle a').text().trim();
        const language = $(element).find('.itemLanguage').text().trim();
        const year = $(element).find('.itemYear').text().trim();
        const country = $(element).find('.itemCountry').text().trim();
        const director = $(element).find('.itemDirector').text().trim();
        const cast = $(element).find('.itemCast').text().trim().split(',').map(s => s.trim()).filter(Boolean);
        const fsk = $(element).find('.itemFSK').text().trim();
        const imageUrl = $(element).find('.itemImage img').attr('src');
        const trailerUrl = $(element).find('.itemTrailer a').attr('href');
        const reviewUrl = $(element).find('.itemReview a').attr('href');

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
          $(element).find('.itemCinemas .cinema').each((_, cinemaElement: CheerioElement) => {
            const cinemaId = $(cinemaElement).attr('data-cinema_id');
            const cinemaName = $(cinemaElement).find('.cinemaName').text().trim();
            const cinemaAddress = $(cinemaElement).find('.cinemaAddress').text().trim();
            const cinemaCity = $(cinemaElement).find('.cinemaCity').text().trim();
            const cinemaPostalCode = $(cinemaElement).find('.cinemaPostalCode').text().trim();
            const cinemaUrl = $(cinemaElement).find('.cinemaUrl').attr('href');

            if (cinemaId && cinemaName) {
              // Add cinema to global list if not exists
              if (!cinemaMap.has(cinemaId)) {
                const cinemaInfo: CinemaInfo = {
                  id: cinemaId,
                  name: cinemaName,
                  address: cinemaAddress,
                  city: cinemaCity,
                  postalCode: cinemaPostalCode,
                  url: cinemaUrl
                };
                cinemaMap.set(cinemaId, cinemaInfo);
                cinemas.push(cinemaInfo);
              }

              // Extract showtimes for this cinema
              const showtimes: Showtime[] = [];
              $(cinemaElement).find('.showtime').each((_, showtimeElement: CheerioElement) => {
                const date = $(showtimeElement).find('.showtimeDate').text().trim();
                const time = $(showtimeElement).find('.showtimeTime').text().trim();
                const showtimeLanguage = $(showtimeElement).find('.showtimeLanguage').text().trim();
                const variants = $(showtimeElement).find('.showtimeVariants').text().trim().split(',').map(s => s.trim()).filter(Boolean);

                if (date && time) {
                  showtimes.push({
                    date,
                    time,
                    language: showtimeLanguage || language,
                    variants
                  });
                }
              });

              // Add cinema with showtimes to movie
              const cinema: Cinema = {
                id: cinemaId,
                name: cinemaName,
                address: cinemaAddress,
                city: cinemaCity,
                postalCode: cinemaPostalCode,
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
