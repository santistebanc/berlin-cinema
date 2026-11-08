import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import http from 'http';
import https from 'https';
import net from 'net';
import { compareIngestion, ORIGINAL_BASE } from './compare-ingestion';
import { ROLLOUT_NOW } from '../pipeline/rollout-fixtures';
import { supportsFilmIdentity } from '../api/pipeline/identity-evidence';
import { identityConflict } from '../api/pipeline/resolve';
const proof = require('./verification-support.cjs');

const limits = ['Synthetic retained-state fixture and captured adapters; no claim about current cinema listings.',
  'No live source, metadata provider, model, publication, or operational pipeline state is used.',
  'Metadata cases are a small source-inspired regression set, not a production precision estimate.'];
const catalog = { scenarios: ['offline-shadow', 'metadata-incidents'], commands: ['discover', 'doctor', 'run', 'controls', 'evidence'],
  requiredChecks: ['npm run typecheck', 'npm test'], baseline: ORIGINAL_BASE, now: ROLLOUT_NOW, limits };

function forbidNetwork() {
  const saved = [http.request, https.request, http.get, https.get, net.Socket.prototype.connect, globalThis.fetch];
  const blocked = () => { throw new Error('verification_network_forbidden'); };
  http.request = blocked; https.request = blocked; http.get = blocked; https.get = blocked;
  net.Socket.prototype.connect = blocked; globalThis.fetch = blocked;
  return () => { [http.request, https.request, http.get, https.get, net.Socket.prototype.connect, globalThis.fetch] = saved as any; };
}

async function metadata(run: any, corrupt: boolean) {
  const fixtures = JSON.parse(fs.readFileSync('pipeline/verification-incidents.json', 'utf8'));
  assert.ok(fixtures.length >= 4, 'incident_set_missing');
  const restore = forbidNetwork();
  try {
    for (const fixture of fixtures) await proof.check(run, fixture.id, () => {
      const actual = !identityConflict(fixture.a, fixture.b) && supportsFilmIdentity(fixture.a, fixture.b);
      assert.equal(actual, corrupt && fixture.id === fixtures[0].id ? !fixture.same : fixture.same);
    });
    await proof.check(run, 'network-is-rejected', () => assert.throws(() => net.connect(443, 'example.invalid'), /verification_network_forbidden/));
  } finally { restore(); run.record.cleanup = 'completed'; }
}

async function shadow(run: any, corrupt: boolean) {
  const scratch = path.join(run.directory, 'scratch');
  const baseline = path.join(scratch, 'baseline');
  fs.mkdirSync(scratch);
  try {
    await proof.check(run, 'pinned-clean-baseline', () => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
      execFileSync('git', ['clone', '--shared', '--no-checkout', process.cwd(), baseline], { stdio: 'pipe', env });
      execFileSync('git', ['-C', baseline, 'checkout', '--detach', ORIGINAL_BASE], { stdio: 'pipe', env });
      fs.symlinkSync(path.resolve('node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    });
    const raw = { scrapedAt: ROLLOUT_NOW, movies: [{ title: 'Verification Film', year: '2026', director: 'Fixture Director',
      url: 'https://www.critic.de/movie/verification/', cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-18', time: '20:00' }] }] };
    const stateFile = path.join(scratch, 'state.json'); const dataDir = path.join(scratch, 'data');
    fs.mkdirSync(dataDir); fs.writeFileSync(path.join(dataDir, 'critic-raw.json'), JSON.stringify(raw));
    const beforePublication = fs.existsSync('public/movies.json') ? proof.digest(fs.readFileSync('public/movies.json')) : null;
    const restore = forbidNetwork();
    try {
      await proof.check(run, 'prepare-disposable-legacy-state', async () => {
        const old = require(path.join(baseline, 'api/pipeline/pipeline'));
        const Store = require(path.join(baseline, 'api/pipeline/store')).PipelineStore;
        const store = new Store(stateFile);
        try { await old.runPipeline({ store, batches: [{ source: 'critic.de', ...raw, observedAt: ROLLOUT_NOW, status: 'cached', complete: false }],
          now: ROLLOUT_NOW, network: false, model: null, tmdb: null, geocoder: null, osm: [], osmAddresses: [], publish: false, audit: false }); }
        finally { store.close(); }
        assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).schemaVersion, 1);
      });
      const inputHash = proof.digest(fs.readFileSync(stateFile));
      const report = await proof.check(run, 'fixed-clock-shadow-replay', () => compareIngestion({ baselineRoot: baseline, stateFile, dataDir,
        output: path.join(scratch, 'comparison'), now: ROLLOUT_NOW }));
      await proof.check(run, 'retained-identity-and-viewing-continuity', () => {
        if (corrupt) report.rolloutGate.blockers.push({ scenario: 'retained-raw-replay', reason: 'negative control: missing identity' });
        assert.equal(report.scenarios.length, 5);
        assert.deepEqual(report.rolloutGate.blockers, []);
        assert.equal(proof.digest(fs.readFileSync(stateFile)), inputHash);
        assert.equal(fs.existsSync('public/movies.json') ? proof.digest(fs.readFileSync('public/movies.json')) : null, beforePublication);
      });
      // The report explicitly lists semantic/provenance differences for inspection.
      fs.copyFileSync(path.join(scratch, 'comparison/comparison.json'), path.join(run.directory, 'comparison.json'));
    } finally { restore(); }
  } finally {
    assert.equal(path.dirname(scratch), run.directory);
    fs.rmSync(scratch, { recursive: true, force: true }); run.record.cleanup = 'completed';
  }
}

async function main() {
  const [command = 'discover', target, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('unexpected_arguments');
  if (command === 'discover' && !target) return console.log(JSON.stringify(catalog, null, 2));
  if (command === 'doctor' && !target) {
    const ready = Number(process.versions.node.split('.')[0]) === 24 && fs.existsSync('node_modules/ts-node/register/index.js');
    console.log(JSON.stringify({ status: ready ? 'ready' : 'blocked', node: process.version, source: proof.identity(), baselineAvailable:
      execFileSync('git', ['cat-file', '-t', ORIGINAL_BASE], { encoding: 'utf8' }).trim() === 'commit', remedy: 'Use Node 24 and npm ci. No operational data is required.' }));
    if (!ready) process.exitCode = 1;
    return;
  }
  if (command === 'evidence') {
    const record = proof.evidence(target); console.log(JSON.stringify(record, null, 2));
    if (!record.sourceMatches || record.status !== 'passed') process.exitCode = 1;
    return;
  }
  if (!['run', 'controls'].includes(command) || !catalog.scenarios.includes(target)) throw new Error('unknown_scenario');
  const run = proof.begin(target, { incidents: proof.digest(fs.readFileSync('pipeline/verification-incidents.json')),
    capturedAdapters: proof.digest(fs.readFileSync('pipeline/rollout-fixtures.ts')), baseline: ORIGINAL_BASE, now: ROLLOUT_NOW }, limits);
  const record = await proof.finish(run, () => target === 'offline-shadow' ? shadow(run, command === 'controls') : metadata(run, command === 'controls'));
  if (command === 'controls') {
    const expected = target === 'offline-shadow' ? 'retained-identity-and-viewing-continuity' : 'unrelated-remake';
    const detected = record.status === 'failed' && record.cleanup === 'completed' && record.checks.some((c: any) => c.name === expected && c.status === 'failed');
    console.log(JSON.stringify({ status: detected ? 'passed' : 'failed', detectedRun: record.id,
      scope: 'Corrupted expected result validates the evidence detector; this is not a product regression or a live metadata evaluation.' }));
    if (!detected) process.exitCode = 1;
  } else { console.log(JSON.stringify(record, null, 2)); if (record.status !== 'passed') process.exitCode = 1; }
}
main().catch(error => { console.error(JSON.stringify({ status: 'blocked', error: error.message })); process.exitCode = 1; });
