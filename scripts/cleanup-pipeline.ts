import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PipelineStore } from '../api/pipeline/store';

const store = new PipelineStore(); const owner = randomUUID();
try {
  if (!store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
  const result = store.cleanupSuperseded();
  console.log(`Archived ${result.archivedIssues} obsolete review items and ${result.archivedVenues} unused empty venues.`);
  console.log('Original evidence, manual corrections, active records and verified API caches were preserved.');
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
finally { store.close(); }
