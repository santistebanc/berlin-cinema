import 'dotenv/config';
import fs from 'fs';
import { MOVIES_PATH, syncData, validateMovieData } from './sync-data';
import { seedAudit } from './seed-audit';
import { PipelineStore } from '../api/pipeline/store';
import { writePublicDataset } from '../api/pipeline/pipeline';

async function main() {
  const store = new PipelineStore(); const snapshot = store.snapshot(); store.close();
  if (snapshot) { writePublicDataset(snapshot); seedAudit(); return; }
  console.log('Loading published data. Run npm run scrape explicitly to refresh local observations.');
  try {
    await syncData();
  } catch (error) {
    // Keep local development usable offline, but never accept a missing/broken dataset.
    validateMovieData(JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf-8')));
    console.warn(`Could not refresh movie data: ${(error as Error).message}. Using the existing local dataset.`);
  }
  seedAudit();
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
