import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { BerlinCinemaScraper } from './services/scraper';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize scraper with error handling
let scraper: BerlinCinemaScraper;
try {
  scraper = new BerlinCinemaScraper();
  console.log('✅ Scraper initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize scraper:', error);
  process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get all movies
app.get('/api/movies', async (req, res) => {
  try {
    console.log('Scraping all movies');
    const result = await scraper.scrapeMovies({});
    
    res.json(result);
  } catch (error) {
    console.error('Error in /api/movies:', error);
    res.status(500).json({ 
      error: 'Failed to fetch movies',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get movies by cinema
app.get('/api/movies/cinema/:cinemaId', async (req, res) => {
  try {
    const { cinemaId } = req.params;
    const filters = { cinema: cinemaId };
    
    const result = await scraper.scrapeMovies(filters);
    
    // Filter movies to only show those playing at the specified cinema
    const filteredMovies = result.movies.filter(movie => 
      movie.cinemas.some(cinema => 
        cinema.id === cinemaId || cinema.name.toLowerCase().includes(cinemaId.toLowerCase())
      )
    );
    
    res.json({
      ...result,
      movies: filteredMovies,
      totalMovies: filteredMovies.length
    });
  } catch (error) {
    console.error('Error in /api/movies/cinema/:cinemaId:', error);
    res.status(500).json({ 
      error: 'Failed to fetch movies for cinema',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get movies by date
app.get('/api/movies/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const filters = { date };
    
    const result = await scraper.scrapeMovies(filters);
    
    res.json(result);
  } catch (error) {
    console.error('Error in /api/movies/date/:date:', error);
    res.status(500).json({ 
      error: 'Failed to fetch movies for date',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});



// Get available cinemas (this would need to be implemented based on the HTML structure)
app.get('/api/cinemas', (req, res) => {
  // For now, return a static list based on what we saw in the HTML
  const cinemas = [
    { id: 'yorck-kinos', name: 'Yorck Kinos', district: 'Schöneberg' },
    { id: 'babylon-kreuzberg', name: 'Babylon Kreuzberg', district: 'Kreuzberg' },
    { id: 'central-kino', name: 'Central-Kino', district: 'Mitte' },
    { id: 'delphi-filmpalast-am-zoo', name: 'Delphi Filmpalast am Zoo', district: 'Charlottenburg' },
    { id: 'filmkunst-66', name: 'Filmkunst 66', district: 'Charlottenburg' },
    { id: 'moviemento', name: 'Moviemento', district: 'Kreuzberg' },
    { id: 'fsk-am-oranienplatz', name: 'fsk am Oranienplatz', district: 'Kreuzberg' },
    { id: 'hackesche-hoefe-kino', name: 'Hackesche Höfe Kino', district: 'Mitte' },
    { id: 'kino-intimes', name: 'Kino Intimes', district: 'Friedrichshain' },
    { id: 'lichtblick-kino', name: 'Lichtblick-Kino', district: 'Prenzlauer Berg' }
  ];
  
  res.json({ cinemas });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Berlin Cinema API server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🎬 Movies endpoint: http://localhost:${PORT}/api/movies`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server terminated');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
