import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

    console.log('Test API called - testing direct scraping...');

    // Test direct scraping with POST request (same as the working curl command)
    const response = await axios.post('https://www.critic.de/ov-movies-berlin/',
      'tx_criticde_pi5%5Bovsearch_cinema%5D=&tx_criticde_pi5%5Bovsearch_cinema_show%5D=&ovsearch_movie_ajax=&tx_criticde_pi5%5Bovsearch_movie%5D=&tx_criticde_pi5%5Bovsearch_district%5D=&tx_criticde_pi5%5Bovsearch_date%5D=&tx_criticde_pi5%5Bovsearch_of%5D=1&tx_criticde_pi5%5Bovsearch_omu%5D=1&tx_criticde_pi5%5Bsubmit_button%5D=search&tx_criticde_pi5%5Bsubmit%5D=&tx_criticde_pi5%5Bovsearch_days%5D=',
      {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'accept-language': 'en-GB,en;q=0.5',
          'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'https://www.critic.de',
          'pragma': 'no-cache',
          'referer': 'https://www.critic.de/ov-movies-berlin/',
          'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'sec-gpc': '1',
          'upgrade-insecure-requests': '1',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
        },
        timeout: 30000
      }
    );

    console.log('Response received, status:', response.status);
    console.log('Response size:', response.data.length);

    const $ = cheerio.load(response.data);
    
    // Test multiple possible selectors to find the right ones
    const itemContainers = $('.itemContainer, .movie-item, .film-item, article, [data-movie_id]');
    const itemTitles = $('.itemTitle a, h2 a, h3 a, .title a, .movie-title a, [data-movie_id] h2, [data-movie_id] h3');
    const itemLanguages = $('.itemLanguage, [data-search_of_value], .language, .ov-badge, .version-badge');
    
    // Also check for common patterns
    const allDivs = $('div');
    const allLinks = $('a');
    const allHeaders = $('h1, h2, h3, h4');
    
    console.log('Found elements:');
    console.log('- itemContainers:', itemContainers.length);
    console.log('- itemTitles:', itemTitles.length);
    console.log('- itemLanguages:', itemLanguages.length);
    console.log('- allDivs:', allDivs.length);
    console.log('- allLinks:', allLinks.length);
    console.log('- allHeaders:', allHeaders.length);

    // Try to extract some basic info
    const sampleTitles: string[] = [];
    itemTitles.each((i, el) => {
      if (i < 5) { // First 5 titles
        const title = $(el).text().trim();
        sampleTitles.push(title);
      }
    });

    // Let's inspect the first few containers to see the actual HTML structure
    const firstContainer = itemContainers.first();
    const firstContainerHtml = firstContainer.html()?.substring(0, 500) || 'No HTML found';
    
    // Also check for any text that looks like movie titles
    const allText = $('body').text();
    const movieTitlePatterns = allText.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)?.slice(0, 10) || [];
    
    const result = {
      status: 'success',
      responseStatus: response.status,
      responseSize: response.data.length,
      elementsFound: {
        itemContainers: itemContainers.length,
        itemTitles: itemTitles.length,
        itemLanguages: itemLanguages.length,
        allDivs: allDivs.length,
        allLinks: allLinks.length,
        allHeaders: allHeaders.length
      },
      sampleTitles,
      firstContainerHtml,
      movieTitlePatterns,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in test API:', error);
    res.status(500).json({ 
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : undefined : undefined
    });
  }
}
