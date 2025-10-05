const express = require('express');
const BerlinCinemaScraper = require('./berlin-cinema-scraper');

const router = express.Router();

// Initialize scraper
let scraper = null;

// GET /api/movies
router.get('/', async (req, res) => {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (!scraper) {
      scraper = new BerlinCinemaScraper();
    }

    const result = await scraper.scrapeMovies();

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in movies API:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;