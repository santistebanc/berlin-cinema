import HttpClient from './http-client';
import FormDataBuilder from './form-data-builder';
import MovieParser from './movie-parser';
import MovieMerger from './movie-merger';

class BerlinCinemaScraper {
  private baseUrl = 'https://www.critic.de/ov-movies-berlin/';
  private httpClient: HttpClient;
  private movieParser: MovieParser;

  constructor() {
    this.httpClient = new HttpClient();
    this.movieParser = new MovieParser(this.httpClient);
  }

  async scrapeMovies() {
    try {
      const formData = FormDataBuilder.buildSearchForm();
      const response = await this.httpClient.post(this.baseUrl, formData);
      const movies = this.movieParser.parseMovies(response.data);
      const mergedMovies = MovieMerger.mergeMovies(movies as any);

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

export default BerlinCinemaScraper;
