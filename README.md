# Berlin Cinema App

A modern React frontend for discovering OV (Original Version) movies playing in Berlin cinemas.

## Features

- 🎬 Browse all available OV movies
- 🔍 Search movies by title
- 🏢 Filter movies by cinema
- 📅 Filter movies by date
- 🎭 Detailed movie information with showtimes
- 🎪 Cinema-specific movie listings
- 📱 Responsive design for all devices
- 🎨 Modern UI with Tailwind CSS

## Screenshots

The app features a clean, modern interface with:
- Hero section with search functionality
- Movie grid with detailed cards
- Filter options for cinemas and dates
- Detailed movie pages with showtimes
- Cinema-specific pages

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

3. Build for production:
```bash
npm run build
```

## Prerequisites

Make sure the Berlin Cinema API backend is running on `http://localhost:3001` before starting the frontend.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Header.tsx      # Navigation header
│   ├── MovieCard.tsx   # Movie display card
│   └── SearchFilters.tsx # Search and filter controls
├── pages/              # Page components
│   ├── HomePage.tsx    # Main movie listing page
│   ├── MovieDetailPage.tsx # Individual movie details
│   └── CinemaPage.tsx  # Cinema-specific movie listings
├── services/           # API communication
│   └── api.ts         # API service functions
├── types/              # TypeScript type definitions
│   └── index.ts       # Shared types and interfaces
├── App.tsx             # Main app component with routing
├── main.tsx            # React entry point
└── index.css           # Global styles with Tailwind CSS
```

## Technologies Used

- **React 18** - Modern React with hooks
- **TypeScript** - Type-safe development
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icons
- **Vite** - Fast build tool and dev server
- **Axios** - HTTP client for API calls

## API Integration

The app communicates with the Berlin Cinema API to:
- Fetch movie listings
- Search for specific movies
- Get cinema information
- Filter movies by various criteria

## Development

The app uses Vite for fast development with:
- Hot module replacement
- TypeScript support
- CSS preprocessing
- Proxy configuration for API calls

## Styling

Built with Tailwind CSS featuring:
- Custom color palette for cinema theme
- Responsive design utilities
- Component-based styling
- Dark mode ready (can be easily extended)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
