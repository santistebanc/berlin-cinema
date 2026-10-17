import { collectSource } from './collect-source';

export async function scrapeBerlinDe(): Promise<void> { await collectSource('berlin.de'); }

if (require.main === module) scrapeBerlinDe().catch(error => { console.error(error); process.exitCode = 1; });
