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

    // Cookie storage - starts empty, gets populated by server responses
    this.cookies = {};
  }

  // Get formatted cookie string for headers
  getCookieString() {
    const cookieEntries = Object.entries(this.cookies);
    return cookieEntries.length > 0
      ? cookieEntries.map(([name, value]) => `${name}=${value}`).join('; ')
      : '';
  }

  // Update cookies from response headers
  updateCookiesFromResponse(response) {
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
      setCookieHeaders.forEach(cookieHeader => {
        const cookieMatch = cookieHeader.match(/^([^=]+)=([^;]+)/);
        if (cookieMatch) {
          const [, name, value] = cookieMatch;
          this.cookies[name] = value;
        }
      });
    }
  }

  isCacheValid() {
    if (!this.cache || !this.cacheTimestamp) return false;
    const now = new Date();
    const cacheAge = now.getTime() - this.cacheTimestamp.getTime();
    return cacheAge < 60 * 60 * 1000; // 1 hour
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
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          'cookie': this.getCookieString()
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

      // Track any new cookies from the response
      this.updateCookiesFromResponse(response);

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
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'content-type': 'application/x-www-form-urlencoded',
            'origin': 'https://www.critic.de',
            'referer': 'https://www.critic.de/ov-movies-berlin/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'cookie': this.getCookieString()
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

        // Track any new cookies from the search response
        this.updateCookiesFromResponse(searchResponse);

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

        // Extract variant from title
        let variants = [];

        if (title.includes('(Imax)')) variants.push('Imax');
        else if (title.includes('(EXPN)')) variants.push('EXPN');
        else if (title.includes('(OV w/ sub)')) variants.push('sub');
        else if (title.includes('(OV)')) variants.push('OV');

        // Extract poster URL
        const posterElement = $item.find('img').first();
        let posterUrl = posterElement.attr('src') || posterElement.attr('data-src');

        if (posterUrl && !posterUrl.startsWith('http')) {
          posterUrl = `https://www.critic.de${posterUrl}`;
        }

        // Extract real cinema and showtime data
        const movieCinemas = [];
        const movieShowings = [];

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

          // Add cinema to cinemas array
          movieCinemas.push({
            name: cinemaName,
            address: address
          });

          // Extract individual showings from the table
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
                  const parsedDate = this.parseDate(dateHeader);
                  const dayOfWeek = this.getDayOfWeek(dateHeader);

                  // Parse times (can be multiple times separated by <br> or other separators)
                  let times = [];

                  // First try splitting by newline
                  times = cellText.split('\n').map(time => time.trim()).filter(time => time);

                  // If that didn't work well, try splitting by common separators
                  if (times.length === 1 && times[0].length > 8) {
                    // If we got one long string, try splitting by common patterns
                    const timePattern = /(\d{1,2}:\d{2})/g;
                    const matches = times[0].match(timePattern);
                    if (matches && matches.length > 1) {
                      times = matches;
                    }
                  }

                  // Additional cleanup: remove any non-time content
                  times = times.map(time => {
                    // Extract only the time pattern HH:MM
                    const timeMatch = time.match(/(\d{1,2}:\d{2})/);
                    return timeMatch ? timeMatch[1] : time;
                  }).filter(time => time && time.match(/^\d{1,2}:\d{2}$/));

                  // Debug logging for time parsing
                  if (times.length > 1) {
                    console.log(`Time parsing debug for ${cinemaName} on ${dateHeader}:`);
                    console.log(`  Original cellText: "${cellText}"`);
                    console.log(`  Parsed times:`, times);
                  }

                  if (times.length > 0) {
                    // Create individual showing for each time
                    times.forEach(time => {
                      movieShowings.push({
                        date: parsedDate,
                        originalDate: dateHeader,
                        time: time,
                        dayOfWeek: dayOfWeek,
                        cinema: cinemaName,
                        address: address,
                        city: city,
                        postalCode: postalCode,
                        url: cinemaUrl ? (cinemaUrl.startsWith('http') ? cinemaUrl : `https://www.critic.de${cinemaUrl}`) : null
                      });
                    });
                  }
                }
              });
            });
          }

          // Debug logging for URL construction
          if (cinemaUrl) {
            console.log(`Cinema URL debug - ${cinemaName}:`);
            console.log(`  Original: ${cinemaUrl}`);
            console.log(`  Final: ${cinemaUrl.startsWith('http') ? cinemaUrl : `https://www.critic.de${cinemaUrl}`}`);
          }
        });

        // Create movie object with the new structure
        const movie = {
          title: title,
          director: movieDetails.director || null,
          cast: movieDetails.cast ? movieDetails.cast.split(',').map(s => s.trim()) : null,
          country: movieDetails.country || null,
          year: movieDetails.year || null,
          posterUrl: posterUrl || null,
          url: movieUrl.startsWith('http') ? movieUrl : `https://www.critic.de${movieUrl}`,
          variants: variants,
          cinemas: movieCinemas,
          showings: movieShowings
        };

        movies.push(movie);
      });

      // Merge movies with the same base title
      console.log('Merging movies with same base titles...');
      const mergedMovies = this.mergeMovies(movies);
      console.log(`Merged ${movies.length} movies into ${mergedMovies.length} unique movies`);

      // Process data for frontend consumption
      console.log('Processing data for frontend...');
      const processedMovies = this.processDataForFrontend(mergedMovies);

      const result = {
        movies: processedMovies,
        total: processedMovies.length,
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
      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]);

      // Assume current year and create a proper date
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day); // month is 0-indexed

      // If the date is in the past, assume it's next year
      if (date < new Date()) {
        date.setFullYear(currentYear + 1);
      }

      // Calculate the actual day of the week from the parsed date
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return dayNames[date.getDay()];
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

      // Only add a year if the date is more than a month in the past
      const now = new Date();
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      if (date < oneMonthAgo) {
        date.setFullYear(currentYear + 1);
      }

      return date.toISOString().split('T')[0];
    }

    // If we can't parse it, return a fallback
    return new Date().toISOString().split('T')[0];
  }

  // Get base title without variants
  getBaseTitle(title) {
    return title.replace(/\s*\([^)]*\)/g, '').trim();
  }

  // Merge movies with the same base title and create the new structure
  mergeMovies(movies) {
    const movieMap = new Map();

    movies.forEach(movie => {
      const baseTitle = this.getBaseTitle(movie.title);

      if (!movieMap.has(baseTitle)) {
        // Create new merged movie with the new structure
        const mergedMovie = {
          title: baseTitle,
          director: movie.director,
          cast: movie.cast,
          country: movie.country,
          year: movie.year,
          posterUrl: movie.posterUrl,
          url: movie.url,
          variants: new Set(),
          cinemas: new Set(),
          showings: {} // Changed to object for organized structure
        };
        movieMap.set(baseTitle, mergedMovie);
      }

      const mergedMovie = movieMap.get(baseTitle);

      // Merge variants
      if (movie.variants) {
        movie.variants.forEach(variant => mergedMovie.variants.add(variant));
      }

      // Merge cinemas
      if (movie.cinemas) {
        movie.cinemas.forEach(cinema => {
          mergedMovie.cinemas.add(JSON.stringify(cinema));
        });
      }

      // Merge showings into organized structure
      if (movie.showings && Array.isArray(movie.showings)) {
        movie.showings.forEach(showing => {
          // Parse and format date properly
          let formattedDate;
          if (showing.originalDate === 'Today') {
            // Handle "Today" specially
            const today = new Date();
            formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
          } else {
            // Parse the date string and format it
            const date = new Date(showing.date);
            if (isNaN(date.getTime())) {
              // If parsing failed, try to parse the original date string
              const dateMatch = showing.originalDate.match(/(\w{3})\s+(\d{1,2})\/(\d{1,2})/);
              if (dateMatch) {
                const dayAbbr = dateMatch[1];
                const day = parseInt(dateMatch[2]);
                const month = parseInt(dateMatch[3]);
                const currentYear = new Date().getFullYear();
                const parsedDate = new Date(currentYear, month - 1, day);

                // Only add a year if the date is more than a month in the past
                const now = new Date();
                const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

                if (parsedDate < oneMonthAgo) {
                  parsedDate.setFullYear(currentYear + 1);
                }

                formattedDate = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
              } else {
                // Fallback to original date string
                formattedDate = showing.originalDate;
              }
            } else {
              formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
            }
          }

          // Format time as "13:50"
          const formattedTime = showing.time;

          // Determine variant (OV, sub, Imax, EXPN)
          let variant = null;
          if (movie.variants && movie.variants.length > 0) {
            // Look for specific variants in the movie title or variants array
            if (movie.variants.includes('OV')) variant = 'OV';
            else if (movie.variants.includes('sub')) variant = 'sub';
            else if (movie.variants.includes('Imax')) variant = 'Imax';
            else if (movie.variants.includes('EXPN')) variant = 'EXPN';
            else variant = movie.variants[0]; // Take first available variant
          }

          // Initialize date if it doesn't exist
          if (!mergedMovie.showings[formattedDate]) {
            mergedMovie.showings[formattedDate] = {};
          }

          // Initialize time if it doesn't exist
          if (!mergedMovie.showings[formattedDate][formattedTime]) {
            mergedMovie.showings[formattedDate][formattedTime] = [];
          }

          // Add cinema and variant info
          const showingInfo = {
            cinema: showing.cinema,
            variant: variant
          };

          // Check if this exact showing already exists
          const exists = mergedMovie.showings[formattedDate][formattedTime].some(s =>
            s.cinema === showingInfo.cinema && s.variant === showingInfo.variant
          );

          if (!exists) {
            mergedMovie.showings[formattedDate][formattedTime].push(showingInfo);
          }
        });
      }
    });

    // Convert Sets to arrays and format the final structure
    return Array.from(movieMap.values()).map(movie => {
      // Sort the showings object by date and time
      const sortedShowings = {};
      Object.keys(movie.showings)
        .sort((a, b) => {
          // For ISO date strings (YYYY-MM-DD), direct string comparison works
          return a.localeCompare(b);
        })
        .forEach(date => {
          sortedShowings[date] = {};
          Object.keys(movie.showings[date])
            .sort((a, b) => a.localeCompare(b))
            .forEach(time => {
              sortedShowings[date][time] = movie.showings[date][time];
            });
        });

      return {
        ...movie,
        variants: Array.from(movie.variants),
        cinemas: Array.from(movie.cinemas).map(cinemaStr => JSON.parse(cinemaStr)),
        showings: sortedShowings
      };
    });
  }

  // Process and prepare data for frontend
  processDataForFrontend(movies) {
    return movies.map(movie => {
      // The data is already processed and sorted in mergeMovies
      // No additional processing needed - return the movie as is
      return movie;
    });
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
    
    // Set cache control headers to expire after 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1 hour = 3600 seconds
    res.setHeader('Expires', new Date(Date.now() + 3600000).toUTCString()); // 1 hour from now
    res.setHeader('Pragma', 'no-cache');

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

    // Log sample data structure for debugging
    if (result.movies.length > 0) {
      const sampleMovie = result.movies[0];
      console.log('Sample movie structure:');
      console.log('- Title:', sampleMovie.title);
      console.log('- Variants:', sampleMovie.variants);
      console.log('- Cinemas count:', sampleMovie.cinemas.length);
      // Count total showings from the nested structure
      let totalShowings = 0;
      if (sampleMovie.showings && typeof sampleMovie.showings === 'object') {
        Object.values(sampleMovie.showings).forEach(dateShowings => {
          Object.values(dateShowings).forEach(timeShowings => {
            totalShowings += timeShowings.length;
          });
        });
      }
      console.log('- Showings count:', totalShowings);
      if (totalShowings > 0) {
        console.log('- Sample showing entry:', Object.values(sampleMovie.showings)[0]);
      }
    }

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
