import 'dotenv/config';
import { merge } from './merge';

if (require.main === module) merge({ network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow'),
  forceEnrich: process.argv.includes('--force-enrich'), skipBerlinDe: process.argv.includes('--skip-berlin-de')
}).catch(error => { console.error(error.message); process.exitCode = 1; });
