# Berlin Cinema API

A TypeScript API for scraping and providing structured data about OV (Original Version) movies playing in Berlin cinemas.

## Features

- 🎬 Scrape movie data from critic.de
- 🏢 Get cinema information and showtimes
- 🔍 Search movies by title, cinema, or date
- 📅 Filter by specific dates
- 🌍 Support for OV and OmU (Original Version with German subtitles) movies

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Start the development server:
```bash
npm run dev
```

Or start the production server:
```bash
npm start
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Health Check
- `GET /health` - Check if the API is running

### Movies
- `POST /api/movies` - Get all movies with optional filters
- `GET /api/movies/cinema/:cinemaId` - Get movies playing at a specific cinema
- `GET /api/movies/date/:date` - Get movies playing on a specific date
- `GET /api/movies/search/:query` - Search movies by title

### Cinemas
- `GET /api/cinemas` - Get list of available cinemas

## Example Usage

### Get all movies
```bash
curl -X POST http://localhost:3001/api/movies
```

### Search for a specific movie
```bash
curl http://localhost:3001/api/movies/search/materialists
```

### Get movies at a specific cinema
```bash
curl http://localhost:3001/api/movies/cinema/yorck-kinos
```

## Data Structure

The API returns structured data including:

- **Movie**: title, year, director, cast, poster, language, FSK rating
- **Cinema**: name, address, district, showtimes
- **Showtime**: date, times, day of week

## Technologies Used

- **TypeScript** - Type-safe development
- **Express.js** - Web framework
- **Cheerio** - HTML parsing
- **Axios** - HTTP client
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing

## Notes

- This API scrapes data from critic.de, so please be respectful of their servers
- The scraping is based on the current HTML structure and may need updates if the website changes
- Consider implementing rate limiting for production use
