const express = require('express');
const path = require('path');
const cors = require('cors');

// Import API route handlers
const moviesRouter = require('./api/movies-express');
const imageProxyRouter = require('./api/image-proxy-express');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files with proper MIME types and cache control
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year for JS files
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year for CSS files
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache'); // No cache for JSON files
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // No cache for HTML
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// API Routes
app.use('/api/movies', moviesRouter);
app.use('/api/image-proxy', imageProxyRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle old cached JS files by serving the current version
app.get('/assets/index-19b6822e.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'dist', 'assets', 'index-22b7dd5e.js'));
});

// Handle other old cached JS files
app.get('/assets/index-37edccf7.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'dist', 'assets', 'index-22b7dd5e.js'));
});

// Handle any old JS files by serving the current version
app.get('/assets/index-:hash.js', (req, res) => {
  const fs = require('fs');
  const assetsDir = path.join(__dirname, 'dist', 'assets');
  
  // Find the current JS file
  const files = fs.readdirSync(assetsDir);
  const currentJsFile = files.find(file => file.startsWith('index-') && file.endsWith('.js'));
  
  if (currentJsFile) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(assetsDir, currentJsFile));
  } else {
    res.status(404).send('JS file not found');
  }
});

// Serve React app for all other routes (SPA fallback)
app.get('*', (req, res) => {
  // Only serve HTML for non-API, non-asset requests
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api`);
});
