import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BerlinCinemaScraper } from '../../berlin-cinema-api/src/services/scraper';

let scraper: BerlinCinemaScraper | null = null;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

    // Initialize scraper if not exists
    if (!scraper) {
      scraper = new BerlinCinemaScraper();
    }

    // Scrape movies to get cinema information
    const result = await scraper.scrapeMovies();
    
    // Extract unique cinemas
    const cinemas = result.cinemas;
    
    // Return cinemas
    res.status(200).json({ cinemas });
  } catch (error) {
    console.error('Error in cinemas API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
