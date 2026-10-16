import 'dotenv/config';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';

async function main() {
  const store = new PipelineStore();
  try {
    const data = await runPipeline({ store, network: !process.argv.includes('--offline'), publish: !process.argv.includes('--shadow') });
    console.log(`${data.total} films/programmes; ${data.review.open} open review issues.`);
  } finally { store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
