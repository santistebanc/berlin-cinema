const express = require('express');
const axios = require('axios');

const router = express.Router();

// GET /api/image-proxy
router.get('/', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    console.log('Proxying image:', url);

    // Fetch the image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
      }
    });

    // Set appropriate headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send the image data
    res.send(response.data);
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ 
      error: 'Failed to proxy image',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;
