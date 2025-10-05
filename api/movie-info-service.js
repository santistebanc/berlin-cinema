const axios = require('axios');
const movieInfo = require('movie-info');
const movieTrailer = require('movie-trailer');

class MovieInfoService {
  constructor() {
    // No API keys needed - using npm packages that work directly
    console.log('🎬 MovieInfoService initialized with npm packages');
  }

  /**
   * Search for movie using movie-info npm package
   */
  async fetchMovieInfoData(title, year = null) {
    try {
      // Search for the movie
      const searchQuery = year ? `${title} ${year}` : title;
      const details = await movieInfo(searchQuery);
      
      if (details) {
        return {
          tmdbID: details.id,
          tmdbRating: details.vote_average || null,
          tmdbVotes: details.vote_count || null,
          overview: details.overview || null,
          releaseDate: details.release_date || null,
          popularity: details.popularity || null,
          genres: details.genre_ids ? this.mapGenreIds(details.genre_ids) : null,
          backdropUrl: details.backdrop_path ? `${details.imageBase}${details.backdrop_path}` : null,
          posterUrl: details.poster_path ? `${details.imageBase}${details.poster_path}` : null,
          originalTitle: details.original_title || null,
          originalLanguage: details.original_language || null,
          adult: details.adult || false
        };
      }
      
      return null;
    } catch (error) {
      console.log(`Failed to fetch movie info for "${title}":`, error.message);
      return null;
    }
  }

  /**
   * Map TMDb genre IDs to genre names
   */
  mapGenreIds(genreIds) {
    const genreMap = {
      28: 'Action',
      12: 'Adventure',
      16: 'Animation',
      35: 'Comedy',
      80: 'Crime',
      99: 'Documentary',
      18: 'Drama',
      10751: 'Family',
      14: 'Fantasy',
      36: 'History',
      27: 'Horror',
      10402: 'Music',
      9648: 'Mystery',
      10749: 'Romance',
      878: 'Science Fiction',
      10770: 'TV Movie',
      53: 'Thriller',
      10752: 'War',
      37: 'Western'
    };
    
    return genreIds.map(id => genreMap[id] || 'Unknown').filter(genre => genre !== 'Unknown');
  }

  /**
   * Fetch trailer URL using movie-trailer npm package
   */
  async fetchTrailerInfo(title, year = null) {
    try {
      const searchQuery = year ? `${title} ${year}` : title;
      const trailerUrl = await movieTrailer(searchQuery, { timeout: 10000 });
      
      if (trailerUrl) {
        return {
          trailerUrl: trailerUrl
        };
      }
      
      return null;
    } catch (error) {
      console.log(`Failed to fetch trailer for "${title}":`, error.message);
      return null;
    }
  }

  /**
   * Fetch comprehensive movie information from all available sources
   */
  async fetchMovieInfo(title, year = null) {
    const [movieInfo, trailerInfo] = await Promise.allSettled([
      this.fetchMovieInfoData(title, year),
      this.fetchTrailerInfo(title, year)
    ]);

    const result = {};

    if (movieInfo.status === 'fulfilled' && movieInfo.value) {
      Object.assign(result, movieInfo.value);
    }

    if (trailerInfo.status === 'fulfilled' && trailerInfo.value) {
      Object.assign(result, trailerInfo.value);
    }

    return Object.keys(result).length > 0 ? result : null;
  }
}

module.exports = MovieInfoService;
