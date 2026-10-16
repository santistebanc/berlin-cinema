import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { recordImportedAudit } from '../api/audit-log';

const MOVIES_URL = 'https://ovberlin.online/movies.json';
export const MOVIES_PATH = path.join(__dirname, '../public/movies.json');

export function validateMovieData(data: any): void {
  if (!data || !Array.isArray(data.movies) || data.movies.length === 0
      || !Number.isFinite(Date.parse(data.scrapedAt))
      || data.movies.some((movie: any) => !movie || typeof movie.title !== 'string'
        || typeof movie.slug !== 'string' || !movie.showings || Array.isArray(movie.showings)
        || typeof movie.showings !== 'object' || !Array.isArray(movie.cinemas))) {
    throw new Error('Movie data is missing or invalid');
  }
}

export async function syncData(url = MOVIES_URL, output = MOVIES_PATH): Promise<void> {
  const { data } = await axios.get(url, { timeout: 20000, signal: AbortSignal.timeout(20000) });
  validateMovieData(data);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data));
    fs.renameSync(temporary, output);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Loaded ${data.movies.length} films from the deployed dataset (updated ${data.scrapedAt}).`);
  if (path.resolve(output) === path.resolve(MOVIES_PATH)) recordImportedAudit(data);
}

if (require.main === module) {
  syncData().catch(error => {
    console.error(`Movie data sync failed: ${error.message}`);
    process.exitCode = 1;
  });
}
