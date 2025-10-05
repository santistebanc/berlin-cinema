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
};
