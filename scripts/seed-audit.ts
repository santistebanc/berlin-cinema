import fs from 'fs';
import path from 'path';
import { AUDIT_DIRECTORY, ensureAuditRunIndex, recordImportedAudit } from '../api/audit-log';

export function seedAudit() {
  // Scrape-produced provenance is richer than an output import; never replace it during builds.
  if (fs.existsSync(path.join(AUDIT_DIRECTORY, 'index.json'))) { ensureAuditRunIndex(); return; }
  const snapshotPath = path.join(__dirname, '../public/movies.json');
  if (!fs.existsSync(snapshotPath)) throw new Error('No movie snapshot is available to initialize the audit');
  const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  recordImportedAudit(data);
  console.log(`Initialized audit baseline from ${data.movies.length} published film records.`);
}

if (require.main === module) seedAudit();
