const HttpClient = require('./http-client');
const FormDataBuilder = require('./form-data-builder');
const MovieParser = require('./movie-parser');
const MovieMerger = require('./movie-merger');

class BerlinCinemaScraper {
  constructor() {
    this.baseUrl = 'https://www.critic.de/ov-movies-berlin/';
    this.httpClient = new HttpClient();
    this.movieParser = new MovieParser(this.httpClient);
  }

  async scrapeMovies() {
    try {
      const formData = FormDataBuilder.buildSearchForm();
      const response = await this.httpClient.post(this.baseUrl, formData);
      
      const movies = this.movieParser.parseMovies(response.data);
      const mergedMovies = MovieMerger.mergeMovies(movies);

      return {
        movies: mergedMovies,
        total: mergedMovies.length,
        scrapedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error scraping movies:', error);
      throw error;
    }
  }
}

module.exports = BerlinCinemaScraper;
