import { collectLegacyMovies } from './sources/compat';

export default class BerlinCinemaScraper {
  async scrapeRawMovies() { return collectLegacyMovies('critic.de'); }
}
