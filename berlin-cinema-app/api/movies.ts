import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BerlinCinemaScraper } from '../src/services/scraper';

// Initialize scraper (will be created per request in production)
let scraper: BerlinCinemaScraper | null = null;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('Movies API called - initializing scraper...');

    // Initialize scraper if not exists
    if (!scraper) {
      scraper = new BerlinCinemaScraper();
      console.log('Scraper initialized');
    }

    console.log('Starting to scrape movies...');
    
    // Scrape movies
    const result = await scraper.scrapeMovies();
    
    console.log(`Scraping completed. Found ${result.movies.length} movies and ${result.cinemas.length} cinemas`);
    
    // Return the result
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in movies API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : undefined : undefined
    });
  }
}
