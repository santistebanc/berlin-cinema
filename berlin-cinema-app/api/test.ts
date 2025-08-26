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

    // Test direct scraping
    const response = await axios.get('https://www.critic.de/ov-movies-berlin/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });

    console.log('Response received, status:', response.status);
    console.log('Response size:', response.data.length);

    const $ = cheerio.load(response.data);
    
    // Test basic selectors
    const itemContainers = $('.itemContainer');
    const itemTitles = $('.itemTitle a');
    const itemLanguages = $('.itemLanguage');
    
    console.log('Found elements:');
    console.log('- itemContainers:', itemContainers.length);
    console.log('- itemTitles:', itemTitles.length);
    console.log('- itemLanguages:', itemLanguages.length);

    // Try to extract some basic info
    const sampleTitles: string[] = [];
    itemTitles.each((i, el) => {
      if (i < 5) { // First 5 titles
        const title = $(el).text().trim();
        sampleTitles.push(title);
      }
    });

    const result = {
      status: 'success',
      responseStatus: response.status,
      responseSize: response.data.length,
      elementsFound: {
        itemContainers: itemContainers.length,
        itemTitles: itemTitles.length,
        itemLanguages: itemLanguages.length
      },
      sampleTitles,
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
