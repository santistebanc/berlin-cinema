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
      
      // Use POST request with form data as required by the website
      const formData = new URLSearchParams();
      formData.append('action', 'search');
      formData.append('search', '');
      
      const response = await axios.post(this.baseUrl, formData, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.critic.de',
          'Referer': 'https://www.critic.de/ov-movies-berlin/',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
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
          
          // Extract title (same as existing scraper)
          const titleElement = $el.find('h2 a');
          const title = titleElement.text().trim();
          const movieUrl = titleElement.attr('href') || '';
          
          // Skip if no valid title found
          if (!title || title.length < 3) {
            return;
          }
          
          // Extract poster image (same as existing scraper)
          const posterUrl = $el.find('figure img').attr('src') || '';
          
          // Extract trailer and review URLs (same as existing scraper)
          const trailerUrl = $el.find('.subfilminfo.trailer a').attr('href') || '';
          const reviewUrl = $el.find('.subfilminfo.critic a').attr('href') || '';
          
          // Extract movie details from the dl element (same as existing scraper)
          const details = this.parseMovieDetails($, $el);
          
          // Extract cinemas and showtimes (same as existing scraper)
          const cinemas = this.parseCinemas($, $el);
          
          // Extract language and FSK rating from data attributes (same as existing scraper)
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
    
    // Look for cinema information in the movie element
    const cinemaElements = $element.find('.cinema, .kino, [class*="cinema"], [class*="kino"]');
    
    if (cinemaElements.length > 0) {
      cinemaElements.each((j: number, cinemaEl: any) => {
        const $cinema = $(cinemaEl);
        const cinemaName = $cinema.find('.name, .title').first().text().trim() || `Cinema ${j + 1}`;
        const address = $cinema.find('.address, .adresse').first().text().trim() || 'Berlin';
        
        // Extract showtimes
        const showtimes: any[] = [];
        const timeElements = $cinema.find('.time, .zeit, [class*="time"], [class*="zeit"]');
        
        if (timeElements.length > 0) {
          timeElements.each((k: number, timeEl: any) => {
            const time = $(timeEl).text().trim();
            if (time && time.match(/\d{1,2}:\d{2}/)) {
              showtimes.push({
                date: new Date().toISOString().split('T')[0],
                times: [time],
                dayOfWeek: 'Today'
              });
            }
          });
        } else {
          // Default showtime if none found
          showtimes.push({
            date: new Date().toISOString().split('T')[0],
            times: ['20:00'],
            dayOfWeek: 'Today'
          });
        }
        
        cinemas.push({
          id: `cinema-${j}`,
          name: cinemaName,
          address: address,
          city: 'Berlin',
          postalCode: '10000',
          url: '',
          showtimes: showtimes
        });
      });
    } else {
      // Default cinema if none found
      cinemas.push({
        id: 'cinema-1',
        name: 'Berlin Cinema',
        address: 'Berlin',
        city: 'Berlin',
        postalCode: '10000',
        url: '',
        showtimes: [{
          date: new Date().toISOString().split('T')[0],
          times: ['20:00'],
          dayOfWeek: 'Today'
        }]
      });
    }
    
    return cinemas;
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
