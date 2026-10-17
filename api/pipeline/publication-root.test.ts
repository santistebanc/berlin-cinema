import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runPipeline } from './pipeline';
import { PipelineStore } from './store';
import { translateLegacyBatch } from './observations';
import { SourceCollectionSchema } from '../../shared/contracts';
import { scrape } from '../../scripts/scrape';
import { SourceRegistry } from '../sources/registry';

const NOW = '2026-10-17T10:00:00Z';
const checkoutPublic = path.resolve(__dirname, '../../public');
const collection = (title: string, now = NOW) => SourceCollectionSchema.parse(translateLegacyBatch({ source: 'fixture', observedAt: now,
  status: 'fresh', complete: true, movies: [{ title, variants: ['OV'],
    cinemas: [{ name: 'Cinema', address: 'Example Street 1, 10115 Berlin' }],
    showings: [{ cinema: 'Cinema', date: '2026-10-18', time: '20:00' }] }] }));
const options = (store: PipelineStore, root: string) => ({ store, publicationRoot: root, now: NOW,
  network: false, model: null, tmdb: null, geocoder: null, osm: [], publish: true });

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-publication-root-'));
  const store = new PipelineStore(':memory:');
  const blocked: string[] = [];
  const previousRoot = process.env.PIPELINE_PUBLIC_ROOT;
  // A regression must fail before writing the checkout, even during the red run.
  const originals = { writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync, renameSync: fs.renameSync, unlinkSync: fs.unlinkSync };
  const guard = (file: any) => {
    if (typeof file !== 'string') return;
    const relative = path.relative(checkoutPublic, path.resolve(file));
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      blocked.push(file); throw new Error(`Test blocked checkout publication write: ${file}`);
    }
  };
  let failIndex: string | undefined;
  fs.writeFileSync = ((file: any, ...args: any[]) => { guard(file); return (originals.writeFileSync as any)(file, ...args); }) as any;
  fs.mkdirSync = ((file: any, ...args: any[]) => { guard(file); return (originals.mkdirSync as any)(file, ...args); }) as any;
  fs.renameSync = ((from: any, to: any) => {
    guard(from); guard(to); originals.renameSync(from, to);
    if (to === failIndex) { failIndex = undefined; throw new Error('Fixture audit index write failed'); }
  }) as any;
  fs.unlinkSync = ((file: any) => { guard(file); return originals.unlinkSync(file); }) as any;
  try {
    process.env.PIPELINE_PUBLIC_ROOT = path.join(root, 'unused-env-root');
    const snapshot = await runPipeline({ ...options(store, root), collections: [collection('Isolated Film')] });
    assert.equal(snapshot.movies.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'public/movies.json'), 'utf8')), snapshot);
    const audit = JSON.parse(fs.readFileSync(path.join(root, 'public/audit/index.json'), 'utf8'));
    assert.equal(audit.runs.length, 1);
    const run = JSON.parse(fs.readFileSync(path.join(root, 'public/audit/runs', `${audit.latestRunId}.json`), 'utf8'));
    assert.equal(run.status, 'success');
    assert.equal(run.snapshotAt, NOW);
    const previousFiles = ['public/movies.json', 'public/sitemap.xml'].map(file => fs.readFileSync(path.join(root, file)));
    const previousSnapshot = structuredClone(store.snapshot());
    const registry = new SourceRegistry([{ id: 'unavailable', extractionVersion: '1', capabilities: ['screenings'],
      allows: () => false, collect: async () => { throw new Error('Offline source outage token=private-secret'); } }],
    [{ id: 'fixture', adapterId: 'unavailable', enabled: true, cacheIdentity: 'fixture', config: {},
      limits: { requests: 0, filmDetails: 0, venueDetails: 0, attempts: 1 } }]);
    process.env.PIPELINE_PUBLIC_ROOT = root;
    await assert.rejects(scrape({ registry, store, dependencies: { network: true, now: () => NOW,
      diagnostic: () => {}, cache: { get: () => undefined, set: () => {} },
      request: async () => { throw new Error('No network permitted'); } } }),
    (error: any) => error.result?.outcome === 'preserved-acquisition-failure');
    const failedIndex = JSON.parse(fs.readFileSync(path.join(root, 'public/audit/index.json'), 'utf8'));
    assert.equal(failedIndex.runs.length, 2, 'Failed scrape appends to the selected publication audit history');
    assert.equal(failedIndex.runs[0].status, 'failed');
    const failedRun = fs.readFileSync(path.join(root, 'public/audit/runs', `${failedIndex.latestRunId}.json`), 'utf8');
    assert.equal(failedRun.includes('private-secret'), false);
    assert.equal(fs.readFileSync(path.join(root, 'public/audit/runs', `${audit.latestRunId}.json`), 'utf8'), JSON.stringify(run),
      'The previous immutable success report stays intact');
    for (const [index, file] of ['public/movies.json', 'public/sitemap.xml'].entries())
      assert.deepEqual(fs.readFileSync(path.join(root, file)), previousFiles[index]);
    assert.deepEqual(store.snapshot(), previousSnapshot, 'Failure preserves the last good store publication');
    process.env.PIPELINE_PUBLIC_ROOT = path.join(root, 'unused-env-root');
    await assert.rejects(scrape({ registry, store, publicationRoot: root, dependencies: { network: true, now: () => NOW,
      diagnostic: () => {}, cache: { get: () => undefined, set: () => {} },
      request: async () => { throw new Error('No network permitted'); } } }),
    (error: any) => error.result?.outcome === 'preserved-acquisition-failure');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'public/audit/index.json'), 'utf8')).runs.length, 3,
      'Explicit scrape output governs failure audit even when an environment root is also present');

    // Direct pipeline callers also honor the environment, with audit enabled.
    const envRoot = path.join(root, 'environment');
    process.env.PIPELINE_PUBLIC_ROOT = envRoot;
    const envSnapshot = await runPipeline({ ...options(store, envRoot), publicationRoot: undefined,
      collections: [collection('Environment Film')] });
    assert.equal(JSON.parse(fs.readFileSync(path.join(envRoot, 'public/audit/index.json'), 'utf8')).runs.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(envRoot, 'public/movies.json'), 'utf8')), envSnapshot);
    const files = ['public/movies.json', 'public/sitemap.xml', 'public/audit/index.json'];
    const beforeRollback = files.map(file => fs.readFileSync(path.join(envRoot, file)));
    const beforeStore = structuredClone(store.snapshot());
    // Fail at the filesystem boundary after the real audit writer switches its
    // index. Rollback must restore that index as well as dataset/store publication.
    failIndex = path.join(envRoot, 'public/audit/index.json');
    await assert.rejects(runPipeline({ ...options(store, envRoot), now: '2026-10-17T11:00:00Z',
      collections: [collection('Replacement Publication', '2026-10-17T11:00:00Z')] }), /Fixture audit index write failed/);
    for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(path.join(envRoot, file)), beforeRollback[index]);
    assert.deepEqual(store.snapshot(), beforeStore, 'Audit write failure rolls the store publication back');
    assert.equal(store.resource('pipeline:last-outcome')?.data.outcome, 'fatal', 'Useful operation diagnostics survive rollback');
    assert.equal(fs.existsSync(path.join(root, 'unused-env-root')), false, 'Explicit output takes precedence over environment');
    assert.deepEqual(blocked, [], 'Selected publication writes never target the checkout');
    console.log('isolated pipeline success, scrape failure and audit rollback preserve the selected publication');
  } finally {
    if (previousRoot === undefined) delete process.env.PIPELINE_PUBLIC_ROOT; else process.env.PIPELINE_PUBLIC_ROOT = previousRoot;
    Object.assign(fs, originals); store.close(); fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
