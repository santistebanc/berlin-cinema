import 'dotenv/config';
import { merge } from './merge';
import { PipelineRunFailure } from '../api/pipeline/outcomes';

if (require.main === module) merge({ network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow'),
  forceEnrich: process.argv.includes('--force-enrich'), skipBerlinDe: process.argv.includes('--skip-berlin-de')
}).catch(error => { console.error(error.message);
  if (error instanceof PipelineRunFailure) console.error(JSON.stringify(error.result)); process.exitCode = 1; });
