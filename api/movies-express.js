const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

// Self-contained scraper for conventional Node.js
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
    return cacheAge < 24 * 60 * 60 * 1000; // 24 hours
  }

  async scrapeMovies() {
    if (this.isCacheValid()) {
      console.log('Using cached data');
      return this.cache;
    }

    try {
      console.log('Scraping movies from:', this.baseUrl);
      
      // First, get the search form page
      const response = await axios.get(this.baseUrl, {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'en-US,en;q=0.9',
          'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'null',
          'pragma': 'no-cache',
          'priority': 'u=0, i',
          'sec-ch-ua': '"Not;A=Brand";v="99", "Microsoft Edge";v="139", "Chromium";v="139"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
        },
        timeout: 30000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_2_method'
        }),
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });

      const html = response.data;
      console.log('Initial response status:', response.status);
      console.log('Initial HTML length:', html.length);
      
      // Save initial HTML for debugging
      const fs = require('fs');
      fs.writeFileSync('debug-initial.html', html);
      console.log('Saved initial HTML to debug-initial.html');
      
      let $ = cheerio.load(html);
      
      // Check if we already have movie results
      let movieItems = $('.itemContainer');
      console.log('Initial itemContainer count:', movieItems.length);
      
      // If no movies found, submit the search form
      if (movieItems.length === 0) {
        console.log('No movies found, submitting search form to get results...');
        
        // Submit the search form with default values to get all movies
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
        
        const searchResponse = await axios.post(this.baseUrl, formData, {
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://www.critic.de',
            'referer': this.baseUrl,
            'pragma': 'no-cache',
            'priority': 'u=0, i',
            'sec-ch-ua': '"Not;A=Brand";v="99", "Microsoft Edge";v="139", "Chromium";v="139"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'
          },
          timeout: 30000,
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_2_method'
          }),
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 400;
          }
        });
        
        const searchHtml = searchResponse.data;
        console.log('Search form response status:', searchResponse.status);
        console.log('Search form response HTML length:', searchHtml.length);
        
        // Save the search results HTML
        fs.writeFileSync('debug-search-results.html', searchHtml);
        console.log('Saved search results HTML to debug-search-results.html');
        
        // Parse the search results
        $ = cheerio.load(searchHtml);
        movieItems = $('.itemContainer');
        console.log('Search results - itemContainer count:', movieItems.length);
      }
      
      // Parse the real HTML structure from response.html
      const movies = [];
      
      // Debug: Check what elements are actually in the HTML
      console.log('Final itemContainer count:', movieItems.length);
      console.log('All h1, h2, h3 elements:', $('h1, h2, h3').length);
      console.log('All links:', $('a').length);
      console.log('All divs:', $('div').length);
      
      // Debug: Show some actual content
      $('h1, h2, h3').each((i, el) => {
        if (i < 5) console.log(`Heading ${i}:`, $(el).text().trim());
      });
      
      movieItems.each((i, item) => {
        const $item = $(item);
        
        // Extract movie ID and metadata
        const movieId = $item.attr('data-movie_id');
        const searchOfValue = $item.attr('data-search_of_value');
        const searchFskValue = $item.attr('data-search_fsk_value');
        const searchMovieTypes = $item.attr('data-search_movie_types');
        
        // Extract title and link
        const titleElement = $item.find('h2 a, h1 a').first();
        const title = titleElement.text().trim();
        const movieUrl = titleElement.attr('href');
        
        if (!title || !movieUrl) return;
        
        console.log(`Processing movie ${i + 1}:`, title);
        
        // Extract movie details from the dl.oneline element
        const movieDetails = {};
        $item.find('dl.oneline dt, dl.oneline dd').each((j, el) => {
          const $el = $(el);
          if ($el.hasClass('hidden')) return;
          
          const text = $el.text().trim();
          if (text === 'D:') {
            const director = $el.next('dd').text().trim();
            if (director) movieDetails.director = director;
          } else if (text === 'With:') {
            const cast = $el.next('dd').text().trim();
            if (cast) movieDetails.cast = cast;
          } else if (text === 'Produktion:') {
            const production = $el.next('dd').text().trim();
            if (production) {
              // Parse "Finland, USA 2025" format
              const parts = production.split(' ');
              if (parts.length >= 2) {
                const year = parts[parts.length - 1];
                const countries = parts.slice(0, -1).join(' ');
                movieDetails.country = countries;
                movieDetails.year = year;
              }
            }
          }
        });
        
        // Extract language/variant from title
        let language = 'DE';
        let variants = [];
        
        if (title.includes('(OV)')) {
          language = 'OV';
          variants.push('OV');
        } else if (title.includes('(OmU)')) {
          language = 'OmU';
          variants.push('OmU');
        } else if (title.includes('(OV w/ sub)')) {
          language = 'OV';
          variants.push('sub');
        }
        
        // Extract additional variants
        if (title.includes('(Imax)')) variants.push('Imax');
        if (title.includes('(EXPN)')) variants.push('EXPN');
        if (title.includes('(3D)')) variants.push('3D');
        if (title.includes('(4DX)')) variants.push('4DX');
        if (title.includes('(Dolby Atmos)')) variants.push('Dolby Atmos');
        if (title.includes('(Premium Large Format)')) variants.push('Premium Large Format');
        
        // Extract poster URL
        const posterElement = $item.find('img').first();
        let posterUrl = posterElement.attr('src') || posterElement.attr('data-src');
        
        if (posterUrl && !posterUrl.startsWith('http')) {
          posterUrl = `https://www.critic.de${posterUrl}`;
        }
        
        // Extract real cinema and showtime data
        const cinemas = [];
        $item.find('article.cinema').each((j, cinemaEl) => {
          const $cinema = $(cinemaEl);
          
          // Extract cinema name and address
          const cinemaLink = $cinema.find('address a').first();
          const cinemaName = cinemaLink.text().trim();
          const cinemaUrl = cinemaLink.attr('href');
          
          // Extract address (text after the link)
          const addressText = $cinema.find('address').text().trim();
          const address = addressText.replace(cinemaName, '').trim();
          
          // Parse address components
          const addressParts = address.split(',').map(part => part.trim());
          const streetAddress = addressParts[0] || '';
          const cityPostal = addressParts[1] || '';
          const cityPostalParts = cityPostal.split(' ');
          const postalCode = cityPostalParts[0] || '';
          const city = cityPostalParts.slice(1).join(' ') || 'Berlin';
          
          // Extract showtimes from the table
          const showtimes = [];
          const $table = $cinema.find('table.vorstellung');
          
          if ($table.length > 0) {
            const $headers = $table.find('thead th');
            const $rows = $table.find('tbody tr');
            
            $rows.each((rowIndex, row) => {
              const $row = $(row);
              const $cells = $row.find('td');
              
              $cells.each((cellIndex, cell) => {
                const $cell = $(cell);
                const cellText = $cell.text().trim();
                
                if (cellText && $cell.hasClass('wird_gezeigt')) {
                  // Parse the date from header
                  const dateHeader = $headers.eq(cellIndex).text().trim();
                  
                  // Parse times (can be multiple times separated by <br>)
                  const times = cellText.split('\n').map(time => time.trim()).filter(time => time);
                  
                                     if (times.length > 0) {
                     // Find or create showtime entry for this date
                     let showtimeEntry = showtimes.find(entry => entry.originalDate === dateHeader);
                     if (!showtimeEntry) {
                       showtimeEntry = {
                         date: this.parseDate(dateHeader),
                         originalDate: dateHeader,
                         times: [],
                         dayOfWeek: this.getDayOfWeek(dateHeader)
                       };
                       showtimes.push(showtimeEntry);
                     }
                     
                     // Add times to the entry
                     showtimeEntry.times.push(...times);
                   }
                }
              });
            });
          }
          
          // Create cinema object
          const cinema = {
            id: `cinema-${movieId}-${j}`,
            name: cinemaName,
            address: address,
            city: city,
            postalCode: postalCode,
            url: cinemaUrl ? `https://www.critic.de${cinemaUrl}` : null,
            showtimes: showtimes
          };
          
          cinemas.push(cinema);
        });
        
        // Create movie object with real data
        const movie = {
          id: movieId || `movie-${i}`,
          title: title,
          director: movieDetails.director || null,
          cast: movieDetails.cast ? movieDetails.cast.split(',').map(s => s.trim()) : null,
          country: movieDetails.country || null,
          year: movieDetails.year || null,
          language: language,
          variants: variants,
          posterUrl: posterUrl || null,
          url: movieUrl.startsWith('http') ? movieUrl : `https://www.critic.de${movieUrl}`,
          cinemas: cinemas,
          metadata: {
            searchOfValue: searchOfValue,
            searchFskValue: searchFskValue,
            searchMovieTypes: searchMovieTypes
          }
        };
        
        movies.push(movie);
      });
      
      const result = {
        movies: movies,
        total: movies.length,
        scrapedAt: new Date().toISOString()
      };
      
      // Cache the result
      this.cache = result;
      this.cacheTimestamp = new Date();
      
      return result;
    } catch (error) {
      console.error('Error scraping movies:', error);
      throw error;
    }
  }

  getDayOfWeek(dateStr) {
    if (dateStr === 'Today') return 'Today';
    
    // Parse date strings like "Tue 26/08", "Wed 27/08"
    const dateMatch = dateStr.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const dayAbbr = dateMatch[1];
      const dayMap = {
        'Mon': 'Mon', 'Tue': 'Tue', 'Wed': 'Wed', 'Thu': 'Thu',
        'Fri': 'Fri', 'Sat': 'Sat', 'Sun': 'Sun'
      };
      return dayMap[dayAbbr] || dayAbbr;
    }
    
    return dateStr;
  }

  parseDate(dateStr) {
    if (dateStr === 'Today') {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    
    // Parse date strings like "Tue 26/08", "Wed 27/08"
    const dateMatch = dateStr.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const dayAbbr = dateMatch[1];
      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]);
      
      // Assume current year and create a proper date
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day); // month is 0-indexed
      
      // If the date is in the past, assume it's next year
      if (date < new Date()) {
        date.setFullYear(currentYear + 1);
      }
      
      return date.toISOString().split('T')[0];
    }
    
    // If we can't parse it, return a fallback
    return new Date().toISOString().split('T')[0];
  }
}

// Initialize scraper
let scraper = null;

// GET /api/movies
router.get('/', async (req, res) => {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    console.log('Movies API called - initializing scraper...');

    // Initialize scraper if not exists
    if (!scraper) {
      scraper = new BerlinCinemaScraper();
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
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;
