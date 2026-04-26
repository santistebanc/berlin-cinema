import axios from 'axios';

const OMDB_BASE_URL = 'http://www.omdbapi.com';

interface OmdbResponse {
  Response: 'True' | 'False';
  imdbRating?: string;
}

export async function fetchImdbRating(imdbId: string, apiKey: string): Promise<number | null> {
  try {
    const { data } = await axios.get<OmdbResponse>(OMDB_BASE_URL, {
      params: { i: imdbId, apikey: apiKey },
      timeout: 8000,
    });
    if (data.Response !== 'True' || !data.imdbRating || data.imdbRating === 'N/A') return null;
    const rating = parseFloat(data.imdbRating);
    return isNaN(rating) ? null : rating;
  } catch {
    return null;
  }
}
