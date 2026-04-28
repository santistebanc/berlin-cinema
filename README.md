# OV Berlin

Browse what's playing in Berlin cinemas right now — original version (OV) and subtitled (OmU) films, with showtimes, ratings, trailers, and cinema info.

Live at **[ovberlin.site](https://ovberlin.site)**

| | |
|---|---|
| ![](docs/screenshot1.png) | ![](docs/screenshot2.png) |
| ![](docs/screenshot3.png) | <img src="docs/screenshot4.png" width="48%"> <img src="docs/screenshot5.png" width="48%"> |

## Features

### Browsing & search
- **Fuzzy search** across title, director, cast, genres, and plot
- Listings sorted by number of upcoming showings so the most active films surface first
- Scroll position preserved when navigating back from a movie detail page

### Movie detail
- Poster, backdrop, tagline, plot, runtime, age rating, year, country, director, cast
- **Ratings** — IMDb score with Rotten Tomatoes and Metacritic on hover/tap
- **Trailer** — links to the official YouTube trailer via TMDb
- **Share** — each movie has a unique URL with rich Open Graph previews (WhatsApp, Telegram, social media)

### Showtimes
- Two layouts: **stacked** (grouped by date) and **grid** (cinema × date matrix)
- Filter by **date**, **cinema**, and **format variant** (OV, OmU, Imax, MXP 2D, etc.)
- Showings from two sources merged and deduplicated: [critic.de](https://www.critic.de/ov-movies-berlin/) and [berlin.de](https://www.berlin.de/kino/)
- Format variants shown per showing — a single film can have OV, OmU, and MXP 2D OmU screenings listed separately

### Cinema info
- Tap any cinema name to open a popup with a **Google Maps embed** and direct **website link**
- Cinema websites resolved via OpenStreetMap

### Other
- **Dark / light theme**
- **PWA** — installable on mobile and desktop, works offline after first load
- **Sitemap** generated on every data refresh for SEO

## How the data pipeline works

Data refreshes automatically every 6 hours via GitHub Actions:

1. **Scrape critic.de** — OV/OmU listings with showtimes per cinema
2. **Scrape berlin.de** — broader Berlin cinema listings including format variants
3. **Merge** — deduplicate movies and showings across sources, resolve cinema name aliases to canonical names
4. **Enrich** — fetch poster, backdrop, plot, runtime, genres, trailer, age rating, and cast from **TMDb**
5. **Ratings** — fetch IMDb, Rotten Tomatoes, and Metacritic scores from **OMDb**
6. **Cinema websites** — resolve cinema website URLs from **OpenStreetMap** (Overpass API)
7. **Deploy** — write `public/movies.json` and `public/sitemap.xml`, push to GitHub Pages

There is no backend server. The frontend loads a single static JSON file.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Search | Fuse.js (client-side fuzzy search) |
| Scraping | Cheerio, Axios |
| Movie metadata | TMDb API |
| Ratings | OMDb API |
| Cinema data | OpenStreetMap / Overpass API |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (every 6 hours) |

## Running locally

```bash
# Install dependencies
npm install

# Copy and fill in API keys
cp .env.example .env   # set TMDB_API_KEY and OMDB_API_KEY

# Run the full scraper (writes public/movies.json)
npx tsx scripts/scrape.ts

# Or run each step individually
npx tsx scripts/scrape-critic-de.ts   # writes data/critic-raw.json
npx tsx scripts/scrape-berlin-de.ts   # writes data/berlin-raw.json
npx tsx scripts/merge.ts              # merges, enriches, writes public/movies.json

# Start the dev server
npm run dev
```

### Scraper flags

| Flag | Effect |
|---|---|
| `--force-enrich` | Re-fetch TMDb and OMDb data even if already cached |
| `--skip-berlin-de` | Skip the berlin.de scrape (critic.de only, faster) |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TMDB_API_KEY` | Yes | [TMDb API key](https://www.themoviedb.org/settings/api) — metadata, posters, trailers |
| `OMDB_API_KEY` | No | [OMDb API key](https://www.omdbapi.com/apikey.aspx) — IMDb, Rotten Tomatoes, Metacritic ratings |
