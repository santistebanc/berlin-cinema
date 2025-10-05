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
    console.log('🎬 Fetching movies from API...');
    const startTime = Date.now();
    
    const response = await api.get('/movies');
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Movies fetched successfully in ${duration}ms`);
    console.log(`📊 Found ${response.data.movies?.length || 0} movies`);
    console.log('🎭 Sample movie:', response.data.movies?.[0]?.title || 'No movies');
    
    // Log the complete scraping results object
    console.log('📋 Complete scraping results:', response.data);
    console.log('🔍 Full response structure:', {
      movies: response.data.movies?.length || 0,
      count: response.data.count,
      timestamp: response.data.timestamp,
      sampleMovie: response.data.movies?.[0] || null
    });
    
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
