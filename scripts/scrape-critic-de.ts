import { collectSource } from './collect-source';

export async function scrapeCriticDe(): Promise<void> { await collectSource('critic.de'); }

if (require.main === module) scrapeCriticDe().catch(error => { console.error(error); process.exitCode = 1; });
