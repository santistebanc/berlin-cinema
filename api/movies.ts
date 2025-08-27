import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Self-contained scraper for Vercel
class VercelBerlinCinemaScraper {
  private baseUrl = 'https://www.critic.de/ov-movies-berlin/';
  private cache: any = null;
  private cacheTimestamp: Date | null = null;

  private isCacheValid(): boolean {
    if (!this.cache || !this.cacheTimestamp) return false;
    const now = new Date();
    const cacheAge = now.getTime() - this.cacheTimestamp.getTime();
    return cacheAge < 24 * 60 * 60 * 1000; // 24 hours
  }

  async scrapeMovies() {
    if (this.isCacheValid()) {
      console.log('Using cached data');
      return this.cache;
    }

    try {
      console.log('Scraping movies from:', this.baseUrl);
      
                    // Use POST request with form data exactly as the curl command
              const formData = new URLSearchParams();
              formData.append('tx_criticde_pi5[ovsearch_cinema]', '');
              formData.append('tx_criticde_pi5[ovsearch_cinema_show]', '');
              formData.append('ovsearch_movie_ajax', '');
              formData.append('tx_criticde_pi5[ovsearch_movie]', '');
              formData.append('tx_criticde_pi5[ovsearch_district]', '');
              formData.append('tx_criticde_pi5[ovsearch_date]', '');
              formData.append('tx_criticde_pi5[ovsearch_of]', '1');
              formData.append('tx_criticde_pi5[ovsearch_omu]', '1');
              formData.append('tx_criticde_pi5[submit_button]', 'search');
              formData.append('tx_criticde_pi5[submit]', '');
              formData.append('tx_criticde_pi5[ovsearch_days]', '');
      
                    const response = await axios.post(this.baseUrl, formData, {
                headers: {
                  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                  'accept-language': 'en-GB,en;q=0.5',
                  'cache-control': 'no-cache',
                  'content-type': 'application/x-www-form-urlencoded',
                  'origin': 'https://www.critic.de',
                  'pragma': 'no-cache',
                  'priority': 'u=0, i',
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
        timeout: 30000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false, // Ignore SSL certificate issues
          secureProtocol: 'TLSv1_2_method'
        }),
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Accept redirects
        }
      });

      const html = response.data;
      console.log('Response status:', response.status);
      console.log('HTML length:', html.length);
      
      const $ = cheerio.load(html);
      
      // Use the exact same parsing logic as the working berlin-cinema-api project
      const movies: any[] = [];
      
      // Debug: Check what elements are actually in the HTML
      console.log('All elements with class containing "movie":', $('[class*="movie"]').length);
      console.log('All elements with class containing "film":', $('[class*="film"]').length);
      console.log('All elements with class "itemContainer":', $('.itemContainer').length);
      console.log('All h1, h2, h3 elements:', $('h1, h2, h3').length);
      console.log('All links:', $('a').length);
      console.log('All divs:', $('div').length);
      
      // Debug: Show some actual content
      $('h1, h2, h3').each((i, el) => {
        if (i < 5) console.log(`Heading ${i}:`, $(el).text().trim());
      });
      
      $('a').each((i, el) => {
        if (i < 5) console.log(`Link ${i}:`, $(el).text().trim());
      });
      
      // Use the exact working selector from the existing scraper
      const movieItems = $('.itemContainer');
      console.log(`Found ${movieItems.length} movie items with .itemContainer selector`);
      
      if (movieItems.length === 0) {
        // If no movies found, return empty result
        console.log('No movie elements found in HTML');
        console.log('HTML preview:', html.substring(0, 1000));
        return {
          movies: [],
          totalMovies: 0,
          scrapedAt: new Date().toISOString(),
          error: 'No movie elements found in HTML'
        };
      }
      
      // Parse each movie item using the exact same logic as the existing scraper
      movieItems.each((i, el) => {
        try {
          const $el = $(el);
          
          // Extract movie ID (same as existing scraper)
          const movieId = $el.attr('data-movie_id') || `movie-${i}`;
          
          // Extract title from h2 a element
          const titleElement = $el.find('h2 a');
          const title = titleElement.text().trim();
          const movieUrl = titleElement.attr('href') || '';
          
          // Skip if no valid title found
          if (!title || title.length < 3) {
            return;
          }
          
          // Extract poster image from figure img and ensure it's absolute
          let posterUrl = $el.find('figure img').attr('src') || '';
          if (posterUrl && !posterUrl.startsWith('http')) {
            posterUrl = `https://www.critic.de${posterUrl}`;
          }
          
          // Extract trailer and review URLs and ensure they're absolute
          let trailerUrl = $el.find('.subfilminfo.trailer a').attr('href') || '';
          if (trailerUrl && !trailerUrl.startsWith('http')) {
            trailerUrl = `https://www.critic.de${trailerUrl}`;
          }
          
          let reviewUrl = $el.find('.subfilminfo.critic a').attr('href') || '';
          if (reviewUrl && !reviewUrl.startsWith('http')) {
            reviewUrl = `https://www.critic.de${reviewUrl}`;
          }
          
          // Debug: Log image extraction
          console.log(`Movie: ${title}`);
          console.log(`  Raw poster src: ${$el.find('figure img').attr('src')}`);
          console.log(`  Final poster URL: ${posterUrl}`);
          console.log(`  Raw trailer href: ${$el.find('.subfilminfo.trailer a').attr('href')}`);
          console.log(`  Final trailer URL: ${trailerUrl}`);
          console.log(`  Raw review href: ${$el.find('.subfilminfo.critic a').attr('href')}`);
          console.log(`  Final review URL: ${reviewUrl}`);
          
          // Extract movie details from the dl.oneline element
          const details = this.parseMovieDetails($, $el);
          
          // Extract cinemas and showtimes from article.cinema elements
          const cinemas = this.parseCinemas($, $el);
          
          // Extract language and FSK rating from data attributes
          const language = $el.attr('data-search_of_value') === 'omu' ? 'OmU' : 'OV';
          const fskRating = parseInt($el.attr('data-search_fsk_value') || '0');
          
          // Create movie object with real extracted data
          movies.push({
            id: movieId,
            title: title,
            originalTitle: title,
            year: details.year,
            country: details.country,
            director: details.director,
            cast: details.cast,
            posterUrl: posterUrl,
            trailerUrl: trailerUrl || undefined,
            reviewUrl: reviewUrl || undefined,
            language: language,
            fskRating: fskRating,
            cinemas: cinemas
          });
        } catch (error) {
          console.error('Error parsing movie:', error);
          return;
        }
      });

      const result = {
        movies: movies,
        totalMovies: movies.length,
        scrapedAt: new Date().toISOString()
      };

      // Cache the result
      this.cache = result;
      this.cacheTimestamp = new Date();

      console.log(`Scraping completed. Found ${movies.length} movies`);
      return result;

    } catch (error) {
      console.error('Error scraping movies:', error);
      return {
        movies: [],
        totalMovies: 0,
        scrapedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Add the missing methods from the existing scraper
  private parseMovieDetails($: any, $element: any) {
    const $dl = $element.find('dl.oneline');
    let year = 0;
    let country = '';
    let director = '';
    let cast: string[] = [];

    $dl.find('dd').each((index: number, element: any) => {
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
        cast = text.split(',').map((actor: string) => actor.trim());
      }
    });

    return { year, country, director, cast };
  }

  private parseCinemas($: any, $element: any) {
    const cinemas: any[] = [];
    
    // Look for cinema information in article.cinema elements
    const cinemaElements = $element.find('article.cinema');
    
    if (cinemaElements.length > 0) {
      cinemaElements.each((j: number, cinemaEl: any) => {
        const $cinema = $(cinemaEl);
        
        // Extract cinema name and address from address element
        const addressElement = $cinema.find('address');
        const cinemaNameElement = addressElement.find('a');
        const cinemaName = cinemaNameElement.text().trim();
        const cinemaUrl = cinemaNameElement.attr('href') || '';
        
        // Extract full address text (includes both name and address)
        const fullAddressText = addressElement.text().trim();
        const address = fullAddressText.replace(cinemaName, '').trim();
        
        // Extract showtimes from the vorstellung table
        const showtimes: any[] = [];
        const showtimeTable = $cinema.find('table.vorstellung');
        
        if (showtimeTable.length > 0) {
          const headerRow = showtimeTable.find('thead tr th');
          const dateHeaders: string[] = [];
          
          // Extract date headers
          headerRow.each((k: number, headerEl: any) => {
            const headerText = $(headerEl).text().trim();
            if (headerText && headerText !== 'Today') {
              dateHeaders.push(headerText);
            }
          });
          
          // Extract showtimes from table rows
          const timeRows = showtimeTable.find('tbody tr');
          timeRows.each((rowIndex: number, rowEl: any) => {
            const timeCells = $(rowEl).find('td');
            timeCells.each((cellIndex: number, cellEl: any) => {
              const cellText = $(cellEl).text().trim();
              const cellClass = $(cellEl).attr('class');
              
              // Only process cells with showtimes (wird_gezeigt class)
              if (cellClass && cellClass.includes('wird_gezeigt') && cellText) {
                const times = cellText.split('<br>').map((time: string) => time.trim()).filter((time: string) => time.match(/\d{1,2}:\d{2}/));
                
                if (times.length > 0 && dateHeaders[cellIndex - 1]) {
                  showtimes.push({
                    date: this.parseDateFromHeader(dateHeaders[cellIndex - 1]),
                    times: times,
                    dayOfWeek: dateHeaders[cellIndex - 1]
                  });
                }
              }
            });
          });
        }
        
        if (cinemaName) {
          cinemas.push({
            id: `cinema-${j}`,
            name: cinemaName,
            address: address,
            city: 'Berlin',
            postalCode: '10000',
            url: cinemaUrl,
            showtimes: showtimes
          });
        }
      });
    }
    
    return cinemas;
  }
  
  private parseDateFromHeader(headerText: string): string {
    // Parse date from header like "Wed 27/08" or "Tue 26/08"
    const match = headerText.match(/(\w+)\s+(\d{1,2})\/(\d{1,2})/);
    if (match) {
      const day = match[1];
      const date = match[2];
      const month = match[3];
      const currentYear = new Date().getFullYear();
      
      // Create a date string in YYYY-MM-DD format
      return `${currentYear}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`;
    }
    
    // Fallback to today's date
    return new Date().toISOString().split('T')[0];
  }
}

// Initialize scraper
let scraper: VercelBerlinCinemaScraper | null = null;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('Movies API called - initializing scraper...');

    // Initialize scraper if not exists
    if (!scraper) {
      scraper = new VercelBerlinCinemaScraper();
      console.log('Scraper initialized');
    }

    console.log('Starting to scrape movies...');
    
    // Scrape movies
    const result = await scraper!.scrapeMovies();
    
    console.log(`Scraping completed. Found ${result.movies.length} movies`);
    
    // Return the result
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in movies API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : undefined : undefined
    });
  }
}
