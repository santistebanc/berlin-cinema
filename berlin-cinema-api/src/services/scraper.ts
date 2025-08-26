import axios from 'axios';
import * as cheerio from 'cheerio';
import { Movie, Cinema, Showtime, ScrapingResult } from '../types';

// Type for Cheerio element
type CheerioElement = any;

export class BerlinCinemaScraper {
  private readonly baseUrl = 'https://www.critic.de/ov-movies-berlin/';
  private readonly headers = {
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
  };

  async scrapeMovies(filters?: any): Promise<ScrapingResult> {
    try {
      const data = this.buildFormData(filters);
      const response = await axios.post(this.baseUrl, data, { headers: this.headers });
      
      const $ = cheerio.load(response.data);
      const movies: Movie[] = [];

      // Find all movie containers
      $('.itemContainer').each((_, element) => {
        const movie = this.parseMovie($, element);
        if (movie) {
          movies.push(movie);
        }
      });

      return {
        movies,
        totalMovies: movies.length,
        scrapedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error scraping movies:', error);
      throw new Error('Failed to scrape movie data');
    }
  }

  private buildFormData(filters?: any): string {
    const formData = new URLSearchParams();
    
    // Default form data based on the curl request
    formData.append('tx_criticde_pi5[ovsearch_cinema]', filters?.cinema || '');
    formData.append('tx_criticde_pi5[ovsearch_cinema_show]', '');
    formData.append('ovsearch_movie_ajax', filters?.movie || '');
    formData.append('tx_criticde_pi5[ovsearch_movie]', '');
    formData.append('tx_criticde_pi5[ovsearch_district]', filters?.district || '');
    formData.append('tx_criticde_pi5[ovsearch_date]', filters?.date || '');
    formData.append('tx_criticde_pi5[ovsearch_of]', '1');
    formData.append('tx_criticde_pi5[ovsearch_omu]', '1');
    formData.append('tx_criticde_pi5[submit_button]', 'search');
    formData.append('tx_criticde_pi5[submit]', '');
    formData.append('tx_criticde_pi5[ovsearch_days]', '');

    return formData.toString();
  }

  private parseMovie($: cheerio.CheerioAPI, element: CheerioElement): Movie | null {
    try {
      const $element = $(element);
      
      // Extract movie ID
      const movieId = $element.attr('data-movie_id') || '';
      
      // Extract title
      const titleElement = $element.find('h2 a');
      const title = titleElement.text().trim();
      const movieUrl = titleElement.attr('href') || '';
      
      // Extract poster image
      const posterUrl = $element.find('figure img').attr('src') || '';
      
      // Extract trailer and review URLs
      const trailerUrl = $element.find('.subfilminfo.trailer a').attr('href') || '';
      const reviewUrl = $element.find('.subfilminfo.critic a').attr('href') || '';
      
      // Extract movie details from the dl element
      const details = this.parseMovieDetails($, $element);
      
      // Extract cinemas and showtimes
      const cinemas = this.parseCinemas($, $element);
      
      // Extract language and FSK rating from data attributes
      const language = $element.attr('data-search_of_value') === 'omu' ? 'OmU' : 'OV';
      const fskRating = parseInt($element.attr('data-search_fsk_value') || '0');
      
      return {
        id: movieId,
        title,
        year: details.year,
        country: details.country,
        director: details.director,
        cast: details.cast,
        posterUrl,
        trailerUrl: trailerUrl || undefined,
        reviewUrl: reviewUrl || undefined,
        language,
        fskRating,
        cinemas
      };
    } catch (error) {
      console.error('Error parsing movie:', error);
      return null;
    }
  }

  private parseMovieDetails($: cheerio.CheerioAPI, $element: cheerio.Cheerio<CheerioElement>) {
    const $dl = $element.find('dl.oneline');
    let year = 0;
    let country = '';
    let director = '';
    let cast: string[] = [];

    $dl.find('dd').each((index, element) => {
      const text = $(element).text().trim();
      
      if (index === 0) {
        // First dd contains country and year
        const match = text.match(/(.+)\s+(\d{4})/);
        if (match) {
          country = match[1].trim();
          year = parseInt(match[2]);
        }
      } else if (index === 1) {
        // Second dd contains director
        director = text;
      } else if (index === 2) {
        // Third dd contains cast
        cast = text.split(',').map(actor => actor.trim());
      }
    });

    return { year, country, director, cast };
  }

  private parseCinemas($: cheerio.CheerioAPI, $element: cheerio.Cheerio<CheerioElement>): Cinema[] {
    const cinemas: Cinema[] = [];

    $element.find('article.cinema').each((_, cinemaElement) => {
      const $cinema = $(cinemaElement);
      
      // Extract cinema name and address
      const $address = $cinema.find('address');
      const cinemaName = $address.find('a').text().trim();
      const cinemaUrl = $address.find('a').attr('href') || '';
      const addressText = $address.contents().last().text().trim();
      
      // Parse address components
      const addressMatch = addressText.match(/(.+),\s*(\d{5})\s+(.+)/);
      const address = addressMatch ? addressMatch[1].trim() : addressText;
      const postalCode = addressMatch ? addressMatch[2] : '';
      const city = addressMatch ? addressMatch[3] : 'Berlin';
      
      // Extract showtimes
      const showtimes = this.parseShowtimes($, $cinema);
      
      // Generate cinema ID from name
      const cinemaId = cinemaName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      cinemas.push({
        id: cinemaId,
        name: cinemaName,
        address,
        city,
        postalCode,
        url: cinemaUrl,
        showtimes
      });
    });

    return cinemas;
  }

  private parseShowtimes($: cheerio.CheerioAPI, $cinema: cheerio.Cheerio<CheerioElement>): Showtime[] {
    const showtimes: Showtime[] = [];
    
    $cinema.find('table.vorstellung thead th').each((index, headerElement) => {
      if (index === 0) return; // Skip "Today" column
      
      const dayHeader = $(headerElement).text().trim();
      const dayMatch = dayHeader.match(/(\w+)\s+(\d{2})\/(\d{2})/);
      
      if (dayMatch) {
        const dayOfWeek = dayMatch[1];
        const day = dayMatch[2];
        const month = dayMatch[3];
        const date = `2025-${month}-${day}`; // Assuming 2025 based on the sample data
        
        // Find corresponding times in the tbody
        const times: string[] = [];
        $cinema.find('table.vorstellung tbody tr').each((_, rowElement) => {
          const $row = $(rowElement);
          const $cell = $row.find(`td:nth-child(${index + 1})`);
          
          if ($cell.hasClass('wird_gezeigt')) {
            const timeText = $cell.text().trim();
            const timeMatches = timeText.match(/(\d{2}:\d{2})/g);
            if (timeMatches) {
              times.push(...timeMatches);
            }
          }
        });
        
        if (times.length > 0) {
          showtimes.push({
            date,
            times,
            dayOfWeek
          });
        }
      }
    });
    
    return showtimes;
  }
}
