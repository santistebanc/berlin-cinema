import axios from 'axios';
import { Movie, ScrapingResult } from '../types';

// Use local API routes for fullstack deployment
const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout for scraping
});

export const movieApi = {
  // Get all movies
  async getAllMovies(): Promise<ScrapingResult> {
    const response = await api.get('/movies');
    return response.data;
  },

  // Get movies by cinema
  async getMoviesByCinema(cinemaId: string): Promise<ScrapingResult> {
    const response = await api.get(`/movies/cinema/${encodeURIComponent(cinemaId)}`);
    return response.data;
  },

  // Get movies by date
  async getMoviesByDate(date: string): Promise<ScrapingResult> {
    const response = await api.get(`/movies/date/${encodeURIComponent(date)}`);
    return response.data;
  },
};



export const healthApi = {
  // Health check
  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await api.get('/health');
    return response.data;
  },
};
