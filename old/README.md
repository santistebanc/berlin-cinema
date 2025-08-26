# Berlin Cinema - OV Movies Project

A complete solution for discovering OV (Original Version) movies playing in Berlin cinemas. This project consists of a TypeScript API backend that scrapes movie data from critic.de and a modern React frontend for browsing and searching movies.

## 🎬 Features

- **Web Scraping**: Automatically fetches movie data from critic.de
- **Structured Data**: Extracts movies, cinemas, showtimes, and metadata
- **Search & Filter**: Find movies by title, cinema, or date
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **Real-time Data**: Always up-to-date movie information
- **API First**: RESTful API for easy integration

## 🏗️ Architecture

```
berlin-cinema/
├── berlin-cinema-api/     # TypeScript Express.js backend
│   ├── src/
│   │   ├── services/      # Web scraping service
│   │   ├── types/         # TypeScript interfaces
│   │   └── index.ts       # Express server
│   └── package.json
├── berlin-cinema-app/     # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API communication
│   │   └── types/         # TypeScript interfaces
│   └── package.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd berlin-cinema
```

### 2. Start the API Backend

```bash
cd berlin-cinema-api
npm install
npm run dev
```

The API will be available at `http://localhost:3001`

### 3. Start the Frontend App

In a new terminal:

```bash
cd berlin-cinema-app
npm install
npm run dev
```

The app will be available at `http://localhost:3000`

## 📖 API Documentation

### Endpoints

- `GET /health` - Health check
- `POST /api/movies` - Get all movies with optional filters
- `GET /api/movies/cinema/:id` - Get movies by cinema
- `GET /api/movies/date/:date` - Get movies by date
- `GET /api/movies/search/:query` - Search movies by title
- `GET /api/cinemas` - Get list of cinemas

### Example Usage

```bash
# Get all movies
curl -X POST http://localhost:3001/api/movies

# Search for a specific movie
curl http://localhost:3001/api/movies/search/materialists

# Get movies at a specific cinema
curl http://localhost:3001/api/movies/cinema/yorck-kinos
```

## 🎨 Frontend Features

- **Homepage**: Browse all movies with search and filters
- **Movie Details**: Comprehensive movie information with showtimes
- **Cinema Pages**: Movies playing at specific cinemas
- **Responsive Design**: Works on all devices
- **Modern UI**: Clean, intuitive interface

## 🛠️ Development

### Backend Development

```bash
cd berlin-cinema-api
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server
```

### Frontend Development

```bash
cd berlin-cinema-app
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the API directory:

```env
PORT=3001
NODE_ENV=development
```

### API Proxy

The frontend is configured to proxy API calls to the backend during development. See `vite.config.ts` for details.

## 📊 Data Structure

The API extracts and provides structured data including:

- **Movies**: Title, year, director, cast, poster, language, FSK rating
- **Cinemas**: Name, address, district, showtimes
- **Showtimes**: Date, times, day of week

## 🌐 Web Scraping

The backend uses:
- **Cheerio**: HTML parsing and manipulation
- **Axios**: HTTP requests with proper headers
- **Respectful scraping**: Proper delays and user agents

## 🚨 Important Notes

- **Respectful Scraping**: The API includes proper delays and headers
- **Rate Limiting**: Consider implementing rate limiting for production use
- **Legal Compliance**: Ensure compliance with critic.de's terms of service
- **Data Accuracy**: Scraping depends on website structure - may need updates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

MIT License - see individual package.json files for details

## 🙏 Acknowledgments

- **critic.de** for providing movie information
- **Berlin cinemas** for showing OV movies
- **Open source community** for the amazing tools used

## 📞 Support

If you encounter any issues:

1. Check the console for error messages
2. Verify both API and frontend are running
3. Check network requests in browser dev tools
4. Open an issue with detailed error information

---

**Enjoy discovering OV movies in Berlin! 🎭🍿**
