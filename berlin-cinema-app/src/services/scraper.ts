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

      // Extract movies using the correct selectors
      $('.placard-left-container').each((_, element: CheerioElement) => {
        // Extract title from the link title attribute
        const titleLink = $(element).find('a[title*="Kinoprogramm"]');
        const title = titleLink.attr('title')?.replace(' - Kinoprogramm', '') || '';
        
        // Extract movie ID from the URL
        const movieUrl = titleLink.attr('href') || '';
        const movieId = movieUrl.match(/\/movie\/[^\/]+\/(\d+)\//)?.[1] || '';
        
        // Extract image URL
        const imageUrl = $(element).find('img').attr('src');
        
        // Extract trailer URL
        const trailerUrl = $(element).find('.subfilminfo.trailer a').attr('href');
        
        // Extract language/version from title (OV, OmU, etc.)
        const languageMatch = title.match(/\((OV|OmU|OV w\/ sub|Original Version)\)/i);
        const language = languageMatch ? languageMatch[1] : '';
        
        // For now, set some default values since the structure is different
        const year = '';
        const country = '';
        const director = '';
        const cast: string[] = [];
        const fsk = '';
        const reviewUrl = '';

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

          // For now, create a basic cinema structure since the detailed cinema data
          // is not immediately visible in the current HTML structure
          // We'll need to investigate further to find where cinema and showtime data is located
          
          // Create a placeholder cinema entry
          const cinema: Cinema = {
            id: movieId,
            name: 'Cinema Information',
            address: '',
            city: '',
            postalCode: '',
            url: '',
            showtimes: []
          };

          movie.cinemas.push(cinema);

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
