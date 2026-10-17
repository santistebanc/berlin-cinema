import { collectLegacyMovies } from './sources/compat';
export type { BerlinDeRawMovie } from './sources/berlin-listings';

export default class BerlinDeScraper {
  async scrapeRawMovies() { return collectLegacyMovies('berlin.de'); }
}
