const express = require('express');
const { BerlinCinemaScraper } = require('./src/services/scraper.ts');

const app = express();
const port = 3001;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Initialize scraper
const scraper = new BerlinCinemaScraper();

// API Routes
app.get('/api/movies', async (req, res) => {
  try {
    console.log('Movies API called - starting to scrape...');
    const result = await scraper.scrapeMovies();
    console.log(`Scraping completed. Found ${result.movies.length} movies`);
    res.json(result);
  } catch (error) {
    console.error('Error in movies API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: 'development',
    platform: 'local'
  });
});

app.listen(port, () => {
  console.log(`Development server running at http://localhost:${port}`);
  console.log('API endpoints:');
  console.log('  GET /api/movies - Scrape and return all movies');
  console.log('  GET /api/health - Health check');
});
