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
app.use(express.static(path.join(__dirname, 'dist')));

// API Routes
app.use('/api/movies', moviesRouter);
app.use('/api/image-proxy', imageProxyRouter);

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api`);
});
