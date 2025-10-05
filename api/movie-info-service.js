const axios = require('axios');

class MovieInfoService {
  constructor() {
    // OMDb API - Free tier available at http://www.omdbapi.com/
    // You can get a free API key from: http://www.omdbapi.com/apikey.aspx
    this.omdbApiKey = process.env.OMDB_API_KEY || '';
    this.omdbBaseUrl = 'http://www.omdbapi.com/';
    
    // TMDb API - Free tier available at https://www.themoviedb.org/settings/api
    this.tmdbApiKey = process.env.TMDB_API_KEY || '';
    this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
  }

  /**
   * Search for movie by title and year on OMDb
   */
  async fetchOMDbInfo(title, year = null) {
    if (!this.omdbApiKey) {
      console.log('⚠️  OMDb API key not configured. Skipping OMDb fetch.');
      return null;
    }

    try {
      const params = {
        apikey: this.omdbApiKey,
        t: title,
        type: 'movie',
        plot: 'full'
      };
      
      if (year) {
        params.y = year;
      }

      const response = await axios.get(this.omdbBaseUrl, { params, timeout: 5000 });
      
      if (response.data.Response === 'True') {
        return {
          imdbID: response.data.imdbID,
          imdbRating: response.data.imdbRating !== 'N/A' ? response.data.imdbRating : null,
          imdbVotes: response.data.imdbVotes !== 'N/A' ? response.data.imdbVotes : null,
          metascore: response.data.Metascore !== 'N/A' ? response.data.Metascore : null,
          plot: response.data.Plot !== 'N/A' ? response.data.Plot : null,
          runtime: response.data.Runtime !== 'N/A' ? response.data.Runtime : null,
          genre: response.data.Genre !== 'N/A' ? response.data.Genre : null,
          awards: response.data.Awards !== 'N/A' ? response.data.Awards : null,
          rated: response.data.Rated !== 'N/A' ? response.data.Rated : null,
          language: response.data.Language !== 'N/A' ? response.data.Language : null
        };
      }
      
      return null;
    } catch (error) {
      console.log(`Failed to fetch OMDb info for "${title}":`, error.message);
      return null;
    }
  }

  /**
   * Search for movie by title on TMDb
   */
  async fetchTMDbInfo(title, year = null) {
    if (!this.tmdbApiKey) {
      console.log('⚠️  TMDb API key not configured. Skipping TMDb fetch.');
      return null;
    }

    try {
      // Search for the movie
      const searchParams = {
        api_key: this.tmdbApiKey,
        query: title,
        language: 'en-US'
      };
      
      if (year) {
        searchParams.year = year;
      }

      const searchResponse = await axios.get(`${this.tmdbBaseUrl}/search/movie`, {
        params: searchParams,
        timeout: 5000
      });

      if (searchResponse.data.results && searchResponse.data.results.length > 0) {
        const movie = searchResponse.data.results[0];
        
        // Fetch additional details
        const detailsResponse = await axios.get(`${this.tmdbBaseUrl}/movie/${movie.id}`, {
          params: {
            api_key: this.tmdbApiKey,
            append_to_response: 'videos,credits'
          },
          timeout: 5000
        });

        const details = detailsResponse.data;
        
        return {
          tmdbID: details.id,
          tmdbRating: details.vote_average || null,
          tmdbVotes: details.vote_count || null,
          overview: details.overview || null,
          releaseDate: details.release_date || null,
          budget: details.budget || null,
          revenue: details.revenue || null,
          popularity: details.popularity || null,
          genres: details.genres ? details.genres.map(g => g.name) : null,
          productionCompanies: details.production_companies ? details.production_companies.map(c => c.name) : null,
          backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null
        };
      }
      
      return null;
    } catch (error) {
      console.log(`Failed to fetch TMDb info for "${title}":`, error.message);
      return null;
    }
  }

  /**
   * Fetch comprehensive movie information from all available sources
   */
  async fetchMovieInfo(title, year = null) {
    const [omdbInfo, tmdbInfo] = await Promise.allSettled([
      this.fetchOMDbInfo(title, year),
      this.fetchTMDbInfo(title, year)
    ]);

    const result = {};

    if (omdbInfo.status === 'fulfilled' && omdbInfo.value) {
      Object.assign(result, omdbInfo.value);
    }

    if (tmdbInfo.status === 'fulfilled' && tmdbInfo.value) {
      Object.assign(result, tmdbInfo.value);
    }

    return Object.keys(result).length > 0 ? result : null;
  }
}

module.exports = MovieInfoService;
