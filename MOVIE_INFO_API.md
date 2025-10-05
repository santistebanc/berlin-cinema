# Movie Information API Integration

This Berlin Cinema app now enriches movie data with additional information from external APIs, including IMDb ratings, plot summaries, and more.

## 🎬 Features

The app fetches additional movie information from two sources:

### OMDb API (IMDb Data)
- IMDb ID and ratings
- IMDb vote counts
- Metascore
- Full plot summaries
- Runtime
- Genre
- Awards
- Content rating (PG, R, etc.)
- Languages

### TMDb API (The Movie Database)
- TMDb ID and ratings
- Vote counts
- Overview/synopsis
- Release dates
- Budget and revenue
- Popularity scores
- Genres (array)
- Production companies
- Backdrop images

## 🔑 Getting API Keys

### OMDb API (Optional)
1. Visit: http://www.omdbapi.com/apikey.aspx
2. Select the FREE tier (1,000 requests/day)
3. Enter your email and verify
4. Copy your API key

### TMDb API (Optional)
1. Create account at: https://www.themoviedb.org/signup
2. Go to Settings → API: https://www.themoviedb.org/settings/api
3. Request an API key (choose "Developer" option)
4. Copy your API key (v3 auth)

## ⚙️ Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```env
   OMDB_API_KEY=your_omdb_api_key_here
   TMDB_API_KEY=your_tmdb_api_key_here
   ```

3. Restart your server:
   ```bash
   npm run dev:fullstack
   ```

## 📊 API Response Structure

Movies now include these optional fields:

```typescript
{
  // Existing fields
  title: string;
  director: string | null;
  year: number | null;
  
  // New OMDb fields
  imdbID?: string;
  imdbRating?: string;          // e.g., "8.5"
  imdbVotes?: string;           // e.g., "1,234,567"
  metascore?: string;           // e.g., "85"
  plot?: string;                // Full plot summary
  runtime?: string;             // e.g., "142 min"
  genre?: string;               // e.g., "Drama, Thriller"
  awards?: string;              // e.g., "Won 4 Oscars"
  rated?: string;               // e.g., "PG-13"
  language?: string;            // e.g., "English, German"
  
  // New TMDb fields
  tmdbID?: number;
  tmdbRating?: number;          // e.g., 8.5
  tmdbVotes?: number;           // e.g., 12345
  overview?: string;            // Plot overview
  releaseDate?: string;         // e.g., "2024-10-05"
  budget?: number;              // In USD
  revenue?: number;             // In USD
  popularity?: number;          // TMDb popularity score
  genres?: string[];            // e.g., ["Drama", "Thriller"]
  productionCompanies?: string[]; // e.g., ["Warner Bros.", "Legendary"]
  backdropUrl?: string;         // High-res backdrop image URL
}
```

## 🚀 Performance

- **Batch Processing**: Movies are enriched in batches of 5 to avoid overwhelming the APIs
- **Timeout Protection**: Each API call has a 5-second timeout
- **Graceful Degradation**: If API calls fail, the app continues with scraped data
- **Rate Limiting**: Small delays between batches respect API limits

## 📝 Notes

- **API keys are optional**: The app works without them but won't include additional movie information
- **Free tier limits**: OMDb allows 1,000 requests/day, TMDb allows 1,000/day at 50/second
- **Caching**: Consider implementing caching for production to reduce API calls
- **Data accuracy**: External APIs may not always have data for all movies, especially international or indie films

## 🔧 Troubleshooting

### "API key not configured" warning
- This is normal if you haven't set up API keys
- The app will still work, just without additional movie information

### Movies not being enriched
1. Check your `.env` file has the correct API keys
2. Verify API keys are valid by testing at:
   - OMDb: `http://www.omdbapi.com/?apikey=YOUR_KEY&t=Inception`
   - TMDb: `https://api.themoviedb.org/3/movie/550?api_key=YOUR_KEY`
3. Check console logs for specific API errors
4. Verify you haven't exceeded daily request limits

### Slow scraping
- Enrichment adds 10-30 seconds to scraping time (depending on number of movies)
- This is normal due to external API calls
- Consider implementing caching for production use
