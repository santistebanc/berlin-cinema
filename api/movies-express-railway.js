const express = require('express');
const axios = require('axios');

const router = express.Router();

// Railway-compatible scraper using regex instead of cheerio
class BerlinCinemaScraper {
  constructor() {
    this.baseUrl = 'https://www.critic.de/ov-movies-berlin/';
    this.cache = null;
    this.cacheTimestamp = null;
  }

  isCacheValid() {
    if (!this.cache || !this.cacheTimestamp) return false;
    const now = new Date();
    const cacheAge = now.getTime() - this.cacheTimestamp.getTime();
    return cacheAge < 60 * 60 * 1000; // 1 hour
  }

  // Simple regex-based HTML parsing (Railway compatible)
  parseMoviesWithRegex(html) {
    const movies = [];
    
    // Find movie containers
    const movieRegex = /<div[^>]*class="[^"]*itemContainer[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    
    while ((match = movieRegex.exec(html)) !== null) {
      const movieHtml = match[1];
      
      try {
        const movie = this.extractMovieData(movieHtml);
        if (movie.title) {
          movies.push(movie);
        }
      } catch (error) {
        console.error('Error parsing movie:', error);
      }
    }
    
    return movies;
  }

  extractMovieData(movieHtml) {
    // Extract title
    const titleMatch = movieHtml.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract year
    const yearMatch = movieHtml.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;
    
    // Extract director
    const directorMatch = movieHtml.match(/Regie[:\s]+([^<]+)/i);
    const director = directorMatch ? directorMatch[1].trim() : '';
    
    // Extract country
    const countryMatch = movieHtml.match(/Land[:\s]+([^<]+)/i);
    const country = countryMatch ? countryMatch[1].trim() : '';
    
    // Extract poster URL
    const posterMatch = movieHtml.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
    const posterUrl = posterMatch ? posterMatch[1] : '';
    
    // Extract variants from title
    const variants = [];
    if (title.includes('(OV)')) variants.push('OV');
    if (title.includes('(sub)')) variants.push('sub');
    if (title.includes('(OmU)')) variants.push('OmU');
    if (title.includes('(OV w/ sub)')) variants.push('sub');
    
    // Clean title (remove variants)
    const cleanTitle = title
      .replace(/\s*\(OV\s*w\/\s*sub\)/i, '')
      .replace(/\s*\(OV\)/i, '')
      .replace(/\s*\(OmU\)/i, '')
      .replace(/\s*\(sub\)/i, '')
      .trim();
    
    return {
      id: `movie-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: cleanTitle,
      year,
      director,
      country,
      posterUrl: posterUrl.startsWith('http') ? posterUrl : `https://www.critic.de${posterUrl}`,
      variants,
      language: 'OV',
      fskRating: 0,
      cinemas: []
    };
  }

  async scrapeMovies() {
    if (this.isCacheValid()) {
      console.log('Using cached data');
      return this.cache;
    }

    try {
      console.log('Scraping movies from:', this.baseUrl);
      
      const response = await axios.get(this.baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000
      });

      const html = response.data;
      console.log('Response status:', response.status);
      console.log('HTML length:', html.length);
      
      // Parse movies using regex instead of cheerio
      const movies = this.parseMoviesWithRegex(html);
      console.log(`Found ${movies.length} movies using regex parsing`);
      
      // Cache the results
      this.cache = movies;
      this.cacheTimestamp = new Date();
      
      return movies;
      
    } catch (error) {
      console.error('Error scraping movies:', error.message);
      throw new Error(`Failed to scrape movies: ${error.message}`);
    }
  }
}

const scraper = new BerlinCinemaScraper();

// GET /api/movies
router.get('/', async (req, res) => {
  try {
    // Set cache control headers to expire after 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1 hour = 3600 seconds
    res.setHeader('Expires', new Date(Date.now() + 3600000).toUTCString()); // 1 hour from now
    res.setHeader('Pragma', 'no-cache');
    
    console.log('GET /api/movies - Starting scrape...');
    const movies = await scraper.scrapeMovies();
    
    if (!movies || movies.length === 0) {
      return res.status(404).json({ 
        error: 'No movies found',
        message: 'The scraper did not find any movies. This might be a temporary issue.'
      });
    }
    
    console.log(`Successfully scraped ${movies.length} movies`);
    res.json({ 
      movies,
      count: movies.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in /api/movies:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/movies/health
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    scraper: 'BerlinCinemaScraper (Railway Compatible)'
  });
});

module.exports = router;
