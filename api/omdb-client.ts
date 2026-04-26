import axios from 'axios';

const OMDB_BASE_URL = 'http://www.omdbapi.com';

interface OmdbResponse {
  Response: 'True' | 'False';
  imdbRating?: string;
  imdbVotes?: string;
  Ratings?: { Source: string; Value: string }[];
}

export interface OmdbData {
  imdbRating: number | null;
  imdbVotes: number | null;
  ratings: { source: string; value: string }[];
}

export async function fetchOmdbData(imdbId: string, apiKey: string): Promise<OmdbData | null> {
  try {
    const { data } = await axios.get<OmdbResponse>(OMDB_BASE_URL, {
      params: { i: imdbId, apikey: apiKey },
      timeout: 8000,
    });
    if (data.Response !== 'True') return null;

    const imdbRating = data.imdbRating && data.imdbRating !== 'N/A'
      ? parseFloat(data.imdbRating) || null
      : null;

    const imdbVotes = data.imdbVotes && data.imdbVotes !== 'N/A'
      ? parseInt(data.imdbVotes.replace(/,/g, ''), 10) || null
      : null;

    const SOURCE_LABELS: Record<string, string> = {
      'Internet Movie Database': 'IMDb',
      'Rotten Tomatoes': 'Rotten Tomatoes',
      'Metacritic': 'Metacritic',
    };

    const ratings = (data.Ratings ?? []).map(r => ({
      source: SOURCE_LABELS[r.Source] ?? r.Source,
      value: r.Value,
    }));

    return { imdbRating, imdbVotes, ratings };
  } catch {
    return null;
  }
}
