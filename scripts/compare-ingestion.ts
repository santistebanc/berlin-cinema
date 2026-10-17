import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';
import { defaultRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';
import { migrateIngestion } from './migrate-ingestion';
import { retainedInventory } from './retained-inventory';
import { capturedRequest, ROLLOUT_NOW } from '../pipeline/rollout-fixtures';
import axios from 'axios';
import { fingerprint } from '../api/pipeline/domain';

export const ORIGINAL_BASE = '1641dedd018422721b53d22e767598da0e1e60d2';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const metadataExclusions = new Set(['id', 'slug', 'slugAliases', 'sourceAliases', 'resolution', 'provenance', 'cinemas', 'showings']);
async function fixedClock<T>(now: string, run: () => Promise<T>): Promise<T> {
  const RealDate = Date; const epoch = RealDate.parse(now);
  (global as any).Date = new Proxy(RealDate, {
    construct: (target, args) => Reflect.construct(target, args.length ? args : [epoch]),
    apply: () => new RealDate(epoch).toString(),
    get: (target, key, receiver) => key === 'now' ? () => epoch : Reflect.get(target, key, receiver),
  });
  try { return await run(); } finally { (global as any).Date = RealDate; }
}
const aliases = (movie: any) => new Set<string>((movie.sourceAliases ?? []).flatMap((a: any) => a.subject ? [a.subject]
  : a.recordId ? [`${a.source}:record:${a.recordId}`] : a.url ? [`${a.source}:url:${a.url}`] : []));
function programme(snapshot: any) {
  const movies = snapshot.movies ?? [];
  return { films: movies.length, viewings: movies.reduce((n: number, m: any) => n + Object.values(m.showings).flatMap((times: any) => Object.values(times).flat()).length, 0),
    verified: movies.filter((m: any) => m.identityStatus === 'verified').length, review: snapshot.review,
    metrics: snapshot.resolutionMetrics ?? null };
}
/** Compare stable public routes and attributed aliases, retaining all changes for human inspection. */
export function compareSnapshots(before: any, after: any) {
  const unchanged: string[] = []; const missing: any[] = []; const splitOrRegrouped: any[] = []; const changed: any[] = [];
  for (const old of before.movies) {
    const oldAliases = aliases(old);
    const candidates = after.movies.filter((m: any) => m.id === old.id || m.slug === old.slug
      || (m.slugAliases ?? []).includes(old.slug) || [...aliases(m)].some(a => oldAliases.has(a)));
    if (!candidates.length) { missing.push({ id: old.id, slug: old.slug, title: old.title }); continue; }
    if (candidates.length !== 1 || candidates[0].id !== old.id || candidates[0].slug !== old.slug)
      splitOrRegrouped.push({ before: { id: old.id, slug: old.slug, title: old.title }, after: candidates.map((m: any) => ({ id: m.id, slug: m.slug, title: m.title, slugAliases: m.slugAliases })) });
    else unchanged.push(old.id);
    for (const movie of candidates) {
      const fields = [...new Set<string>([...Object.keys(old), ...Object.keys(movie)])].filter(field => !metadataExclusions.has(field)
        && JSON.stringify(old[field] ?? null) !== JSON.stringify(movie[field] ?? null));
      if (fields.length) changed.push({ beforeId: old.id, afterId: movie.id, title: movie.title,
        fields: Object.fromEntries(fields.map(field => [field, { before: old[field] ?? null, after: movie[field] ?? null }])) });
    }
  }
  const viewings = (snapshot: any) => new Map<string, any>(snapshot.movies.flatMap((m: any) => Object.entries(m.showings).flatMap(([date, times]: any) =>
    Object.entries(times).flatMap(([time, entries]: any) => entries.map((entry: any) => [`${m.id}|${entry.venueId ?? entry.cinema}|${date}|${time}`,
      Object.fromEntries(Object.entries(entry).filter(([key]) => !['provenance'].includes(key)))])))));
  const oldViewings = viewings(before); const newViewings = viewings(after);
  const routes = (snapshot: any) => new Set(snapshot.movies.flatMap((m: any) => [m.slug, ...(m.slugAliases ?? [])]));
  const subjects = (snapshot: any) => new Set<string>(snapshot.movies.flatMap((m: any) => [...aliases(m)]));
  const venues = (snapshot: any) => new Map<string, any>(snapshot.movies.flatMap((m: any) => (m.cinemas ?? []).map((venue: any) => [venue.id,
    Object.fromEntries(['name', 'address', 'websiteUrl', 'latitude', 'longitude', 'insideBerlin', 'geoapifyPlaceId', 'osmId'].map(key => [key, venue[key] ?? null]))])));
  const oldVenues = venues(before); const newVenues = venues(after);
  const newRoutes = routes(after); const newSubjects = subjects(after);
  const provenanceChanges = before.movies.flatMap((old: any) => {
    const current = after.movies.find((m: any) => m.id === old.id); if (!current) return [];
    const fields = [...new Set([...Object.keys(old.provenance ?? {}), ...Object.keys(current.provenance ?? {})])]
      .filter(field => fingerprint(old.provenance?.[field]) !== fingerprint(current.provenance?.[field]));
    return fields.length ? [{ id: old.id, fields }] : [];
  });
  return { before: programme(before), after: programme(after), stablePublicIdentities: unchanged.length,
    provenanceChanges,
    slugRoutesMissing: [...routes(before)].filter(route => !newRoutes.has(route)), aliasSubjectsMissing: [...subjects(before)].filter(subject => !newSubjects.has(subject)),
    venueDetailsChanged: [...oldVenues].filter(([key, value]) => newVenues.has(key) && fingerprint(value) !== fingerprint(newVenues.get(key))).map(([key, value]) => ({ id: key, before: value, after: newVenues.get(key) })),
    viewingsRemoved: [...oldViewings.keys()].filter(key => !newViewings.has(key)), viewingsAdded: [...newViewings.keys()].filter(key => !oldViewings.has(key)),
    viewingDetailsChanged: [...oldViewings].filter(([key, value]) => newViewings.has(key) && fingerprint(value) !== fingerprint(newViewings.get(key))).map(([key]) => key),
    missing, splitOrRegrouped, changed, newIdentities: after.movies.filter((m: any) => !before.movies.some((old: any) => old.id === m.id)).map((m: any) => ({ id: m.id, slug: m.slug, title: m.title })) };
}

export async function compareIngestion(options: { baselineRoot: string; stateFile: string; dataDir: string; output: string; now: string }) {
  if (!Number.isFinite(Date.parse(options.now))) throw new Error('A fixed --now ISO timestamp is required');
  if (fs.existsSync(options.output)) throw new Error('Comparison output must be a new directory');
  const baselineRoot = path.resolve(options.baselineRoot);
  // Worktree pointers belong to Windows Git in this environment, including when Node runs in WSL.
  const git = process.platform === 'win32' ? 'git' : '/mnt/c/Program Files/Git/cmd/git.exe';
  const gitRoot = process.platform === 'win32' ? baselineRoot : execFileSync('wslpath', ['-w', baselineRoot], { encoding: 'utf8' }).trim();
  const commit = execFileSync(git, ['-C', gitRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (commit !== ORIGINAL_BASE) throw new Error(`Shadow requires pinned original base ${ORIGINAL_BASE}; got ${commit}`);
  if (execFileSync(git, ['-C', gitRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim())
    throw new Error('Pinned baseline has tracked changes; comparison refused');
  const baseline = require(path.join(baselineRoot, 'api/pipeline/pipeline'));
  const BaselineStore = require(path.join(baselineRoot, 'api/pipeline/store')).PipelineStore;
  const inputBytes = fs.readFileSync(options.stateFile); const inputState = JSON.parse(inputBytes.toString('utf8'));
  if (inputState.schemaVersion !== 1) throw new Error('Pinned baseline comparison requires original v1 state');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-shadow-'));
  fs.mkdirSync(options.output, { recursive: true });
  try {
    const bundle = path.join(scratch, 'migrated');
    const migration = migrateIngestion({ ...options, output: bundle, registry: defaultRegistry });
    const oldBatches = defaultRegistry.instances.flatMap(instance => {
      const file = path.join(options.dataDir, instance.retainedFile!);
      if (!fs.existsSync(file)) return [];
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(raw.movies)) throw new Error('Pinned legacy replay requires original {movies,scrapedAt} raw files');
      return [{ source: instance.id, movies: raw.movies, observedAt: raw.scrapedAt, complete: false, status: 'cached' }];
    });
    const scenarios: any[] = [];
    // Exercise the actual old scraper facades and current default adapters on
    // identical captured HTTP responses, with the old parser's global clock fixed.
    const cache = new Map<string, any>();
    const collections = await defaultRegistry.collect({ now: () => ROLLOUT_NOW, network: true, diagnostic: () => {},
      request: capturedRequest, wait: async () => {}, cache: { get: k => cache.get(k), set: (k, data, fetchedAt) => { cache.set(k, { data, fetchedAt }); } } });
    const savedGet = axios.get; const savedPost = axios.post; const RealDate = Date;
    let capturedBatches: any[];
    try {
      (global as any).Date = class extends RealDate { constructor(value?: any) { super(value === undefined ? ROLLOUT_NOW : value); } static now() { return RealDate.parse(ROLLOUT_NOW); } };
      (axios as any).get = async (url: string) => ({ data: (await capturedRequest({ url })).body, headers: {}, status: 200 });
      (axios as any).post = async (url: string) => ({ data: (await capturedRequest({ url })).body, headers: {}, status: 200 });
      capturedBatches = [];
      for (const [source, filename] of [['critic.de', 'berlin-cinema-scraper'], ['berlin.de', 'berlin-de-scraper']]) {
        const Scraper = require(path.join(baselineRoot, `api/${filename}`)).default;
        capturedBatches.push({ source, movies: await new Scraper().scrapeRawMovies(), observedAt: ROLLOUT_NOW, status: 'fresh', complete: true });
      }
    } finally { axios.get = savedGet; axios.post = savedPost; (global as any).Date = RealDate; }
    const oldCapturedStore = new BaselineStore(':memory:'); const newCapturedStore = new PipelineStore(':memory:');
    // Old acquisition collected only listing rows; give its pipeline the same
    // captured detail evidence as the new adapter before comparing venue IDs.
    for (const [key, value] of cache) if (!key.startsWith('source-collection:')) {
      oldCapturedStore.saveResource(key, value.data, value.fetchedAt);
      newCapturedStore.saveResource(key, value.data, value.fetchedAt);
    }
    const captureOptions = { now: ROLLOUT_NOW, network: false, model: null, tmdb: null, geocoder: null, osm: [], osmAddresses: [], publish: false, audit: false };
    const { before: capturedBefore, after: capturedAfter } = await fixedClock(ROLLOUT_NOW, async () => ({
      before: await baseline.runPipeline({ ...captureOptions, store: oldCapturedStore, batches: capturedBatches }),
      after: await runPipeline({ ...captureOptions, store: newCapturedStore, collections }),
    }));
    if (Date.parse(oldCapturedStore.runs()[0]?.started_at) !== Date.parse(ROLLOUT_NOW)
      || Date.parse(newCapturedStore.runs()[0]?.started_at) !== Date.parse(ROLLOUT_NOW))
      throw new Error('Shadow run persistence clocks must match the fixed scenario clock');
    const sourceObservationChanges = oldCapturedStore.observations().flatMap((old: any) => {
      const current = newCapturedStore.head(old.subject);
      if (!current || old.fingerprint === current.fingerprint) return [];
      return [{ subject: old.subject, fields: Object.fromEntries([...new Set([...Object.keys(old.data), ...Object.keys(current.data)])]
        .filter(key => fingerprint(old.data[key]) !== fingerprint(current.data[key])).map(key => [key, { before: old.data[key] ?? null, after: current.data[key] ?? null }])) }];
    });
    scenarios.push({ name: 'actual-default-adapters-captured', now: ROLLOUT_NOW, ...compareSnapshots(capturedBefore, capturedAfter),
      sourceObservationChanges,
      upstreamLineage: { known: collections.flatMap(c => c.records).filter(r => r.provenance.upstreamLineage.length).length,
        unknown: collections.flatMap(c => c.records).filter(r => !r.provenance.upstreamLineage.length).length } });
    fs.writeFileSync(path.join(options.output, 'actual-default-adapters-captured-before.json'), JSON.stringify(capturedBefore));
    fs.writeFileSync(path.join(options.output, 'actual-default-adapters-captured-after.json'), JSON.stringify(capturedAfter));
    for (const name of ['retained-recalculate', 'retained-raw-replay', 'cold-raw-replay', 'expired-replay']) {
      const now = name === 'expired-replay' ? new Date(Date.parse(options.now) + 2 * 86400000).toISOString() : options.now;
      const coldState = { schemaVersion: 1, revision: 0, observations: {}, heads: {}, entities: {}, links: {}, decisions: {}, issues: {}, overrides: [], fields: {},
        resources: Object.fromEntries(Object.entries(inputState.resources).filter(([key]) => /^(tmdb-|omdb:|source-detail:|source-venue:|geoapify:|osm:)/.test(key))),
        spend: {}, snapshots: [], runs: [], jobs: [] };
      const oldFile = path.join(scratch, `${name}-old.json`); fs.writeFileSync(oldFile, name === 'cold-raw-replay' ? JSON.stringify(coldState) : inputBytes);
      const newFile = path.join(scratch, `${name}-new.json`);
      if (name === 'cold-raw-replay') {
        const coldBundle = path.join(scratch, 'cold-migrated');
        migrateIngestion({ stateFile: oldFile, dataDir: options.dataDir, output: coldBundle, registry: defaultRegistry });
        fs.copyFileSync(path.join(coldBundle, 'state.json'), newFile);
      } else fs.copyFileSync(path.join(bundle, 'state.json'), newFile);
      const oldStore = new BaselineStore(oldFile); const newStore = new PipelineStore(newFile);
      try {
        const collections = name === 'retained-recalculate' ? [] : await defaultRegistry.collect(retainedDependencies(newStore, defaultRegistry,
          { network: false, now, dataDir: path.join(bundle, 'data') }), { retained: true });
        const common = { now, network: false, model: null, tmdb: null, geocoder: null, publish: false, audit: false, osmAddresses: [] };
        const { before, after } = await fixedClock(now, async () => ({
          before: await baseline.runPipeline({ ...common, store: oldStore, batches: name === 'retained-recalculate' ? [] : oldBatches }),
          after: await runPipeline({ ...common, store: newStore, collections, operation: 'replay' }),
        }));
        if (Date.parse(oldStore.runs()[0]?.started_at) !== Date.parse(now) || Date.parse(newStore.runs()[0]?.started_at) !== Date.parse(now))
          throw new Error(`Shadow persistence clock mismatch: ${name}`);
        fs.writeFileSync(path.join(options.output, `${name}-before.json`), JSON.stringify(before));
        fs.writeFileSync(path.join(options.output, `${name}-after.json`), JSON.stringify(after));
        scenarios.push({ name, now, ...compareSnapshots(before, after),
          upstreamLineage: { known: collections.flatMap(c => c.records).filter(r => r.provenance.upstreamLineage.length).length,
            unknown: collections.flatMap(c => c.records).filter(r => !r.provenance.upstreamLineage.length).length },
          diagnosticCategories: after.resolutionDiagnostics.reduce((out: any, d: any) => { out[d.category] = (out[d.category] ?? 0) + 1; return out; }, {}) });
      } finally { oldStore.close(); newStore.close(); }
    }
    const report = { schemaVersion: 1, baselineCommit: commit, now: options.now, inputStateSha256: sha(inputBytes),
      inventory: retainedInventory(inputState), migration, scenarios,
      rolloutGate: { behaviorChangesRequireReview: true, coldRebuildSupported: false,
        blockers: scenarios.filter(s => s.name.startsWith('retained-') && (s.missing.length || s.splitOrRegrouped.length
          || s.slugRoutesMissing.length || s.aliasSubjectsMissing.length || s.viewingsRemoved.length || s.viewingsAdded.length))
          .map(s => ({ scenario: s.name, reason: 'Retained public identity, alias, route or viewing continuity changed; explain or repair before rollout.' })) },
      limitations: ['Offline evidence is retained, not fresh acquisition.', 'Unknown upstream lineage remains unknown.',
        'Review all split/regrouped/missing identities and metadata differences before operational rollout.',
        'Counts are workload baselines, not estimates of production precision. No live source or provider was queried.'] };
    fs.writeFileSync(path.join(options.output, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
    if (sha(fs.readFileSync(options.stateFile)) !== sha(inputBytes)) throw new Error('Input state changed during shadow verification');
    return report;
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
if (require.main === module) {
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  const required = ['--baseline-root', '--state', '--data', '--output', '--now'];
  if (required.some(name => !process.argv.includes(name) || !arg(name))) { console.error(`Required: ${required.join(' ')}`); process.exitCode = 1; }
  else compareIngestion({ baselineRoot: arg('--baseline-root'), stateFile: arg('--state'), dataDir: arg('--data'), output: arg('--output'), now: arg('--now') })
    .then(report => { console.log(JSON.stringify(report.scenarios.map(s => ({ name: s.name, before: s.before, after: s.after,
      stablePublicIdentities: s.stablePublicIdentities, missing: s.missing.length, splitOrRegrouped: s.splitOrRegrouped.length, changed: s.changed.length })), null, 2));
      if (report.rolloutGate.blockers.length) process.exitCode = 2; })
    .catch(error => { console.error((error as Error).stack); process.exitCode = 1; });
}
