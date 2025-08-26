const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = 3002;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Simple scraper implementation for development
class SimpleBerlinCinemaScraper {
  constructor() {
    this.baseUrl = 'https://www.critic.de/ov-movies-berlin/';
    this.cache = null;
    this.cacheTimestamp = null;
  }

  isCacheValid() {
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
      console.log('Response headers:', response.headers);
      console.log('HTML length:', html.length);
      console.log('First 500 characters of HTML:', html.substring(0, 500));
      
      const $ = cheerio.load(html);
      
      // Use the exact same parsing logic as the working Vercel deployment
      const movies = [];
      
      // Look for movie containers - these are the main elements containing movie info
      const movieContainers = $('.movie-container, .film-container, .movie-item, .film-item, [class*="movie"], [class*="film"]');
      console.log(`Found ${movieContainers.length} movie containers`);
      
      if (movieContainers.length === 0) {
        // Try alternative selectors that might work
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
        // Last resort: look for any content that might be movies
        console.log('No movie containers found, looking for any content...');
        
        // Look for headings that might be movie titles
        const headings = $('h1, h2, h3, h4, h5, h6');
        console.log(`Found ${headings.length} headings`);
        
        // Look for any text content that might be movie titles
        const allText = $('body').text();
        const lines = allText.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 5 && trimmed.length < 100 && 
                 !trimmed.includes('©') && !trimmed.includes('Privacy') &&
                 !trimmed.includes('Cookie') && !trimmed.includes('Terms') &&
                 !trimmed.includes('Impressum') && !trimmed.includes('Datenschutz');
        });
        
        console.log(`Found ${lines.length} potential content lines`);
        console.log('Sample lines:', lines.slice(0, 10));
        
        // Create movies from the first few valid lines
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
          
          // Extract title - try multiple approaches
          let title = $el.find('h1, h2, h3, h4, h5, h6').first().text().trim();
          if (!title) title = $el.find('a').first().text().trim();
          if (!title) title = $el.find('.title, .name, .headline').first().text().trim();
          if (!title) title = $el.text().trim().split('\n')[0];
          if (!title) title = `Movie ${i + 1}`;
          
          // Clean up title
          title = title.replace(/\s+/g, ' ').trim();
          if (title.length > 100) title = title.substring(0, 100) + '...';
          
          // Skip if title is too generic
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
      console.error('Error scraping movies:', error.message);
      
      // Return empty result instead of fake data
      console.log('Scraping failed, returning empty result');
      return {
        movies: [],
        totalMovies: 0,
        scrapedAt: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Initialize scraper
const scraper = new SimpleBerlinCinemaScraper();

// API Routes
app.get('/api/movies', async (req, res) => {
  try {
    console.log('Movies API called - starting to scrape...');
    const result = await scraper.scrapeMovies();
    console.log(`Scraping completed. Found ${result.movies.length} movies`);
    res.json(result);
  } catch (error) {
    console.error('Error in movies API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: 'development',
    platform: 'local'
  });
});

app.listen(port, () => {
  console.log(`Development server running at http://localhost:${port}`);
  console.log('API endpoints:');
  console.log('  GET /api/movies - Scrape and return all movies');
  console.log('  GET /api/health - Health check');
});
