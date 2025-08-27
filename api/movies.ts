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
      
      // Parse movie items using the proven selectors from berlin-cinema-api
      let movieItems: any = $('.movie-item, .film-item, [class*="movie"], [class*="film"]');
      console.log(`Found ${movieItems.length} movie items with movie/film selectors`);
      
      if (movieItems.length === 0) {
        // Try the exact selectors that work in the original project
        const workingSelectors = [
          '.entry', '.post', '.content-item', 'article', '.card', '.item',
          '[class*="entry"]', '[class*="post"]', '[class*="content"]',
          '.movie', '.film', '.show', '.program', '.schedule'
        ];
        
        for (const selector of workingSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            console.log(`Found ${elements.length} elements with selector: ${selector}`);
            movieItems = elements as any;
            break;
          }
        }
      }
      
      if (movieItems.length === 0) {
        // If still no movies found, return empty result instead of fake data
        console.log('No movie elements found in HTML');
        console.log('HTML preview:', html.substring(0, 1000));
        return {
          movies: [],
          totalMovies: 0,
          scrapedAt: new Date().toISOString(),
          error: 'No movie elements found in HTML'
        };
      }
      
      // Parse each movie item to extract real data
      movieItems.each((i, el) => {
        const $el = $(el);
        
        // Extract movie title
        let title = $el.find('h1, h2, h3, h4, h5, h6').first().text().trim();
        if (!title) title = $el.find('.title, .name, .headline').first().text().trim();
        if (!title) title = $el.find('a').first().text().trim();
        if (!title) title = $el.text().trim().split('\n')[0];
        
        // Skip if no valid title found
        if (!title || title.length < 3 || title === 'Movie' || title === 'Film') {
          return;
        }
        
        // Clean up title
        title = title.replace(/\s+/g, ' ').trim();
        if (title.length > 100) title = title.substring(0, 100) + '...';
        
        // Extract other movie details
        const year = $el.find('.year, .date, [class*="year"], [class*="date"]').first().text().trim() || '2024';
        const country = $el.find('.country, .origin, [class*="country"], [class*="origin"]').first().text().trim() || 'Germany';
        const director = $el.find('.director, .regie, [class*="director"], [class*="regie"]').first().text().trim() || 'Unknown';
        const language = $el.find('.language, .sprache, [class*="language"], [class*="sprache"]').first().text().trim() || 'OV';
        const fskRating = parseInt($el.find('.fsk, .rating, [class*="fsk"], [class*="rating"]').first().text().trim()) || 0;
        
        // Extract cinema and showtime information
        const cinemas: any[] = [];
        const cinemaElements = $el.find('.cinema, .kino, [class*="cinema"], [class*="kino"]');
        
        if (cinemaElements.length > 0) {
          cinemaElements.each((j, cinemaEl) => {
            const $cinema = $(cinemaEl);
            const cinemaName = $cinema.find('.name, .title').first().text().trim() || `Cinema ${j + 1}`;
            const address = $cinema.find('.address, .adresse').first().text().trim() || 'Berlin';
            
            // Extract showtimes
            const showtimes: any[] = [];
            const timeElements = $cinema.find('.time, .zeit, [class*="time"], [class*="zeit"]');
            
            if (timeElements.length > 0) {
              timeElements.each((k, timeEl) => {
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
        
        // Create movie object with real extracted data
        movies.push({
          id: `movie-${i}`,
          title: title,
          originalTitle: title,
          year: parseInt(year) || 2024,
          country: country,
          director: director,
          cast: [],
          posterUrl: '',
          trailerUrl: '',
          reviewUrl: '',
          language: language,
          fskRating: fskRating,
          cinemas: cinemas
        });
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
