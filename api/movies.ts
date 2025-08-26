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
      
      // Parse movies with the same logic as local dev
      const movies = [];
      
      // Look for movie containers
      let movieContainers = $('.movie-container, .film-container, .movie-item, .film-item, [class*="movie"], [class*="film"]');
      console.log(`Found ${movieContainers.length} movie containers`);
      
      if (movieContainers.length === 0) {
        // Try alternative selectors
        const altSelectors = [
          '.entry', '.post', '.content-item', 'article', '.card', '.item',
          '[class*="entry"]', '[class*="post"]', '[class*="content"]'
        ];
        
        for (const selector of altSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            console.log(`Found ${elements.length} elements with selector: ${selector}`);
            movieContainers = elements;
            break;
          }
        }
      }
      
      if (movieContainers.length === 0) {
        // Last resort: look for any content
        console.log('No movie containers found, looking for any content...');
        
        const headings = $('h1, h2, h3, h4, h5, h6');
        console.log(`Found ${headings.length} headings`);
        
        const allText = $('body').text();
        const lines = allText.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 5 && trimmed.length < 100 && 
                 !trimmed.includes('©') && !trimmed.includes('Privacy') &&
                 !trimmed.includes('Cookie') && !trimmed.includes('Terms') &&
                 !trimmed.includes('Impressum') && !trimmed.includes('Datenschutz');
        });
        
        console.log(`Found ${lines.length} potential content lines`);
        
        lines.slice(0, 20).forEach((line, i) => {
          const title = line.trim();
          if (title && title.length > 3) {
            movies.push({
              id: `movie-${i}`,
              title: title,
              originalTitle: title,
              year: 2024,
              country: 'Germany',
              director: 'Unknown',
              cast: [],
              posterUrl: '',
              trailerUrl: '',
              reviewUrl: '',
              language: 'OV',
              fskRating: 0,
              cinemas: [{
                id: 'cinema-1',
                name: 'Berlin Cinema',
                address: 'Sample Address',
                city: 'Berlin',
                postalCode: '10000',
                url: '',
                showtimes: [{
                  date: new Date().toISOString().split('T')[0],
                  times: ['20:00'],
                  dayOfWeek: 'Today'
                }]
              }]
            });
          }
        });
      } else {
        // Parse actual movie containers
        console.log(`Parsing ${movieContainers.length} movie containers...`);
        
        movieContainers.each((i, el) => {
          const $el = $(el);
          
          let title = $el.find('h1, h2, h3, h4, h5, h6').first().text().trim();
          if (!title) title = $el.find('a').first().text().trim();
          if (!title) title = $el.find('.title, .name, .headline').first().text().trim();
          if (!title) title = $el.text().trim().split('\n')[0];
          if (!title) title = `Movie ${i + 1}`;
          
          title = title.replace(/\s+/g, ' ').trim();
          if (title.length > 100) title = title.substring(0, 100) + '...';
          
          if (title === 'Movie' || title === 'Film' || title.length < 3) {
            return;
          }
          
          movies.push({
            id: `movie-${i}`,
            title: title,
            originalTitle: title,
            year: 2024,
            country: 'Germany',
            director: 'Unknown',
            cast: [],
            posterUrl: '',
            trailerUrl: '',
            reviewUrl: '',
            language: 'OV',
            fskRating: 0,
            cinemas: [{
              id: 'cinema-1',
              name: 'Berlin Cinema',
              address: 'Sample Address',
              city: 'Berlin',
              postalCode: '10000',
              url: '',
              showtimes: [{
                date: new Date().toISOString().split('T')[0],
                times: ['20:00'],
                dayOfWeek: 'Today'
              }]
            }]
          });
        });
      }

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
    const result = await scraper.scrapeMovies();
    
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
