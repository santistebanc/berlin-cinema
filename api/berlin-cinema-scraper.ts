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

  async scrapeRawMovies(): Promise<any[]> {
    const formData = FormDataBuilder.buildSearchForm();
    const response = await this.httpClient.post(this.baseUrl, formData);
    return this.movieParser.parseMovies(response.data);
  }

  async scrapeMovies() {
    try {
      const rawMovies = await this.scrapeRawMovies();
      const mergedMovies = MovieMerger.mergeMovies(rawMovies as any);

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
