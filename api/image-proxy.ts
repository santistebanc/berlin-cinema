import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Validate that the URL is from critic.de to prevent abuse
    if (!url.startsWith('https://www.critic.de/')) {
      return res.status(400).json({ error: 'Only critic.de URLs are allowed' });
    }

    // Fetch the image from critic.de
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Referer': 'https://www.critic.de/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      timeout: 10000,
    });

    // Set appropriate headers for the image
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send the image data
    res.status(200).send(response.data);

  } catch (error) {
    console.error('Error proxying image:', error);
    console.error('Requested URL:', url);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      response: (error as any)?.response?.status,
      responseData: (error as any)?.response?.data
    });
    
    // Return a default image or error
    res.status(500).json({ 
      error: 'Failed to load image',
      details: error instanceof Error ? error.message : 'Unknown error',
      requestedUrl: url
    });
  }
}
