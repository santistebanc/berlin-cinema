import { Router, Request, Response } from 'express';
import cron from 'node-cron';
import BerlinCinemaScraper from './berlin-cinema-scraper';

const router = Router();
const scraper = new BerlinCinemaScraper();

let cache: Awaited<ReturnType<BerlinCinemaScraper['scrapeMovies']>> | null = null;

async function runScrape() {
  try {
    console.log('[scraper] Starting scrape at', new Date().toISOString());
    cache = await scraper.scrapeMovies();
    console.log('[scraper] Done. Movies:', cache.total);
  } catch (err: any) {
    console.error('[scraper] Failed:', err.message);
  }
}

runScrape();
cron.schedule('0 4 * * *', runScrape);

router.get('/', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!cache) {
    return res.status(503).json({ error: 'Data not ready yet, please retry in a moment.' });
  }

  res.status(200).json(cache);
});

export default router;
