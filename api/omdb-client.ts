import axios from 'axios';

const OMDB_BASE_URL = 'https://www.omdbapi.com';

interface OmdbResponse {
  [field: string]: any;
  Response: 'True' | 'False';
  imdbRating?: string;
  imdbVotes?: string;
  Ratings?: { Source: string; Value: string }[];
}

export interface OmdbData {
  imdbRating: number | null;
  imdbVotes: number | null;
  ratings: { source: string; value: string }[];
  imdbId: string;
  metadata: Record<string, any>;
  raw: Record<string, any>;
}

export async function fetchOmdbData(imdbId: string, apiKey: string, onError?: (reason: string) => void): Promise<OmdbData | null> {
  if (!/^tt\d{7,}$/.test(imdbId)) { onError?.('Invalid IMDb identity'); return null; }
  const text = (value: any) => typeof value === 'string' && value.trim() && value !== 'N/A' ? value.trim() : null;
  const list = (value: any) => text(value)?.split(',').map((part: string) => part.trim()).filter(Boolean) ?? [];
  const number = (value: any) => { const parsed = Number(text(value)?.replace(/,/g, '') ?? NaN); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; };
  try {
    const { data } = await axios.get<OmdbResponse>(OMDB_BASE_URL, {
      params: { i: imdbId, apikey: apiKey, plot: 'full', type: 'movie', r: 'json' },
      timeout: 8000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
    });
    if (data.Response !== 'True') {
      onError?.(/not found/i.test(data.Error || '') ? 'OMDb found no record for the verified IMDb identity.' : 'OMDb rejected the request or its quota was exhausted.');
      return null;
    }
    if (data.imdbID !== imdbId || data.Type !== 'movie') { onError?.('OMDb returned a different IMDb identity or a non-film record. No data was accepted.'); return null; }
    const imdbRating = number(data.imdbRating);
    const imdbVotes = number(data.imdbVotes);

    const SOURCE_LABELS: Record<string, string> = {
      'Internet Movie Database': 'IMDb',
      'Rotten Tomatoes': 'Rotten Tomatoes',
      'Metacritic': 'Metacritic',
    };

    const ratings = (data.Ratings ?? []).map(r => ({
      source: SOURCE_LABELS[r.Source] ?? r.Source,
      value: r.Value,
    }));
    const metascore = number(data.Metascore);
    if (metascore !== null && !ratings.some(rating => rating.source === 'Metacritic')) ratings.push({ source: 'Metacritic', value: `${metascore}/100` });
    const release = text(data.Released); const releasedAt = release ? Date.parse(`${release} UTC`) : NaN;
    return { imdbRating, imdbVotes, ratings, imdbId, raw: data,
      metadata: { title: text(data.Title), year: /^\d{4}$/.test(data.Year || '') ? Number(data.Year) : null,
        director: text(data.Director), directors: list(data.Director), writers: list(data.Writer), cast: list(data.Actors),
        country: text(data.Country), spokenLanguages: list(data.Language).map((name: string) => ({ code: null, name })), genres: list(data.Genre),
        runtime: /^\d+\s+min$/.test(data.Runtime || '') ? Number.parseInt(data.Runtime, 10) : null,
        plot: text(data.Plot), posterUrl: /^https?:\/\//.test(data.Poster || '') ? data.Poster : null,
        releaseDate: Number.isFinite(releasedAt) ? new Date(releasedAt).toISOString().slice(0, 10) : null,
        // OMDb Rated is retained as a US certificate; it cannot silently become a German FSK value.
        certifications: text(data.Rated) ? [{ country: 'US', certification: text(data.Rated) }] : [],
        awards: text(data.Awards), boxOffice: text(data.BoxOffice), metascore } };
  } catch (err: any) {
    onError?.(err.response?.status ? `OMDb returned HTTP ${err.response.status}.` : 'OMDb request failed or timed out.');
    return null;
  }
}
