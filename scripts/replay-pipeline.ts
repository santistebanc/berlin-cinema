import 'dotenv/config';
import { merge } from './merge';
import { PipelineRunFailure } from '../api/pipeline/outcomes';
import { configuredRegistry } from '../api/sources/defaults';

if (require.main === module) merge({ network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow'),
  now: process.argv.includes('--now') ? process.argv[process.argv.indexOf('--now') + 1] : undefined,
  forceEnrich: process.argv.includes('--force-enrich'), registry: configuredRegistry().withSelection({ disabled: process.argv.includes('--skip-berlin-de') ? ['berlin.de'] : [] })
}).catch(error => { console.error(error.message);
  if (error instanceof PipelineRunFailure) console.error(JSON.stringify(error.result)); process.exitCode = 1; });
