const express = require('express');
const cron = require('node-cron');
const BerlinCinemaScraper = require('./berlin-cinema-scraper');

const router = express.Router();
const scraper = new BerlinCinemaScraper();

let cache = null;

async function runScrape() {
  try {
    console.log('[scraper] Starting scrape at', new Date().toISOString());
    cache = await scraper.scrapeMovies();
    console.log('[scraper] Done. Movies:', cache.total);
  } catch (err) {
    console.error('[scraper] Failed:', err.message);
  }
}

// Scrape once on startup, then every day at 4am
runScrape();
cron.schedule('0 4 * * *', runScrape);

// GET /api/movies
router.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!cache) {
    return res.status(503).json({ error: 'Data not ready yet, please retry in a moment.' });
  }

  res.status(200).json(cache);
});

module.exports = router;
