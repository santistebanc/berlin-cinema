import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { migrateIngestion, restoreIngestion } from './migrate-ingestion';
import { exportReleaseState } from './export-release-state';
import { defaultRegistry } from '../api/sources/defaults';
import { defaultStateFile, decodeState, loadStateFile } from '../api/pipeline/state-file';
import { migrateState } from '../api/pipeline/state-format';
import { PipelineStore } from '../api/pipeline/store';

const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-release-state-'));
try {
  const input = defaultStateFile(path.join(__dirname, '../pipeline'));
  const source = fs.readFileSync(input);
  const original = decodeState(source, input);
  const expected = Buffer.from(JSON.stringify(migrateState(original)) + '\n');
  const output = path.join(root, 'migration');
  const options = { stateFile: input, dataDir: path.join(root, 'no-raw'), output, registry: defaultRegistry };
  const manifest = migrateIngestion(options);
  const entry = manifest.outputs.find(entry => entry.file.startsWith('state.'))!;
  const bytes = fs.readFileSync(path.join(output, entry.file));
  console.log(JSON.stringify({ inputBytes: source.length, rawMigratedBytes: expected.length, artifact: entry.file, artifactBytes: bytes.length,
    observations: Object.keys(original.observations).length, corrections: original.overrides.length }));
  assert.ok(bytes.length < 100 * 1024 * 1024, 'The actual migrated release artifact must fit the GitHub 100 MiB blob limit');
  assert.equal(entry.file, 'state.json.gz');
  assert.equal(hash(gunzipSync(bytes)), hash(expected), 'The ENTIRE migrated state, including every evidence/correction/snapshot field, roundtrips exactly');
  assert.equal(hash(bytes), entry.sha256);
  assert.deepEqual(loadStateFile(path.join(output, entry.file)).overrides, original.overrides);
  assert.deepEqual(migrateIngestion(options), manifest, 'Repeated gzip preparation is deterministic and verifies checksums');
  const again = path.join(root, 'again');
  const againManifest = migrateIngestion({ ...options, stateFile: path.join(output, entry.file), output: again });
  assert.deepEqual(fs.readFileSync(path.join(again, entry.file)), bytes);
  assert.equal(againManifest.inputs[0].file, 'state.json.gz');
  const restored = path.join(root, 'restored'); restoreIngestion(again, restored);
  assert.deepEqual(fs.readFileSync(path.join(restored, 'state.json.gz')), bytes, 'Recovery preserves the original compressed bytes');
  const originalRestore = path.join(root, 'original-restore'); restoreIngestion(output, originalRestore);
  assert.deepEqual(fs.readFileSync(path.join(originalRestore, manifest.inputs[0].file)), source, 'Original v1/v2 bytes and filename survive recovery');
  assert.deepEqual(fs.readFileSync(input), source);

  const exported = path.join(root, 'exported'); fs.mkdirSync(exported);
  fs.writeFileSync(path.join(exported, 'state.json'), JSON.stringify(original));
  const sourceFile = path.join(output, entry.file);
  const info = exportReleaseState(sourceFile, exported);
  assert.equal(fs.existsSync(path.join(exported, 'state.json')), false, 'The obsolete plain artifact is removed only after verified replacement');
  assert.equal(hash(fs.readFileSync(info.file)), info.sha256);
  assert.equal(hash(gunzipSync(fs.readFileSync(info.file))), hash(expected));
  assert.equal(defaultStateFile(exported), info.file);
  assert.deepEqual(new PipelineStore(info.file).allOverrides(), [...original.overrides].reverse());
  assert.deepEqual(exportReleaseState(sourceFile, exported), info);
  const saved = fs.readFileSync(info.file);
  fs.writeFileSync(sourceFile + '.lock', 'competing writer');
  assert.throws(() => exportReleaseState(sourceFile, exported), /EEXIST/);
  fs.unlinkSync(sourceFile + '.lock');
  assert.deepEqual(fs.readFileSync(info.file), saved);
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw Error('fixture export rename failure'); };
    assert.throws(() => exportReleaseState(sourceFile, exported), /fixture export rename failure/);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(info.file), saved);
  assert.deepEqual(fs.readdirSync(exported).filter(name => /\.lock$|\.tmp$/.test(name)), []);
  fs.writeFileSync(sourceFile, gzipSync('invalid'));
  assert.throws(() => exportReleaseState(sourceFile, exported), /Invalid pipeline state/);
  assert.deepEqual(fs.readFileSync(info.file), saved);
  fs.writeFileSync(sourceFile, bytes);
  fs.writeFileSync(info.file, saved.subarray(0, 20));
  assert.throws(() => exportReleaseState(sourceFile, exported), /Invalid pipeline state/);
  assert.deepEqual(fs.readFileSync(info.file), saved.subarray(0, 20));
  fs.writeFileSync(info.file, saved);

  // Run the real workflow preparation and commit shell in an exported checkout with a LOCAL remote.
  const checkout = path.join(root, 'checkout'), remote = path.join(root, 'remote.git');
  fs.mkdirSync(checkout);
  const repository = path.join(__dirname, '..');
  for (const name of ['api', 'scripts', 'shared', 'src', '.github', 'package.json', 'tsconfig.server.json'])
    fs.cpSync(path.join(repository, name), path.join(checkout, name), { recursive: true });
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(checkout, 'node_modules'));
  fs.mkdirSync(path.join(checkout, 'pipeline'));
  for (const name of fs.readdirSync(path.join(repository, 'pipeline')).filter(name => name.endsWith('.ts')))
    fs.copyFileSync(path.join(repository, 'pipeline', name), path.join(checkout, 'pipeline', name));
  // Preserve the real release artifact. Decompressing a v2 baseline would push
  // the oversized blob before installing the hook, so Git could reuse it later.
  const retainedState = `pipeline/${path.basename(input)}`;
  fs.writeFileSync(path.join(checkout, retainedState), source);
  fs.mkdirSync(path.join(checkout, 'public/audit'), { recursive: true });
  for (const name of ['movies.json', 'sitemap.xml', 'audit/index.json']) fs.writeFileSync(path.join(checkout, 'public', name), 'fixture');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', ...args],
    { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('add', 'api', 'scripts', 'shared', 'src', '.github', 'package.json', 'tsconfig.server.json', 'pipeline', 'public'); git('commit', '-m', 'fixture baseline');
  assert.ok(Number(git('cat-file', '-s', `HEAD:${retainedState}`)) < 100 * 1024 * 1024,
    'The fixture baseline must fit the release limit before exercising rejection of a new oversized blob');
  git('init', '--bare', remote); git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
  fs.writeFileSync(path.join(remote, 'hooks/pre-receive'), '#!/bin/sh\nwhile read old new ref; do\n git rev-list --objects --no-object-names "$old..$new" | git cat-file --batch-check="%(objecttype) %(objectsize)" | awk \'$1 == "blob" && $2 >= 104857600 { bad=1 } END { exit bad }\' || exit 1\ndone\n', { mode: 0o755 });
  if (expected.length >= 100 * 1024 * 1024) {
    const object = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: checkout, input: expected, encoding: 'utf8' }).trim();
    const tree = execFileSync('git', ['mktree'], { cwd: checkout, input: `100644 blob ${object}\toversized-state.json\n`, encoding: 'utf8' }).trim();
    const rejectedCommit = execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost',
      'commit-tree', tree, '-p', 'HEAD'], { cwd: checkout, input: 'oversized release reproduction\n', encoding: 'utf8' }).trim();
    assert.throws(() => git('push', 'origin', `${rejectedCommit}:refs/heads/main`), /pre-receive hook declined/,
      'The local remote rejects the actual uncompressed migrated blob before accepting the fixed workflow');
    console.log('Local filesize hook reproduced rejection of the actual oversized migrated state');
  }
  const workflow = fs.readFileSync(path.join(repository, '.github/workflows/deploy.yml'), 'utf8').replace(/\r\n/g, '\n');
  const shell = (name: string) => {
    const section = workflow.split(`      - name: ${name}\n`)[1]?.split(/\n      - /)[0];
    const block = section?.split('        run: |\n')[1];
    assert.ok(block, `Real workflow shell exists: ${name}`);
    return block.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  };
  const githubEnv = path.join(root, 'github-env');
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_WORKSPACE: checkout, GITHUB_ENV: githubEnv };
  delete env.PIPELINE_STATE; delete env.PIPELINE_DATA_DIR;
  fs.mkdirSync(path.join(checkout, 'data'));
  execFileSync('bash', ['-e', '-c', shell('Prepare versioned ingestion state in isolation')], { cwd: checkout, env, stdio: 'pipe' });
  const preparedEnvironment = () => Object.fromEntries(fs.readFileSync(githubEnv, 'utf8').trim().split('\n').map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
  const prepared = preparedEnvironment();
  assert.ok(prepared.PIPELINE_STATE.endsWith('.gz'));
  assert.equal(hash(gunzipSync(fs.readFileSync(prepared.PIPELINE_STATE))), hash(expected));
  const commitShell = shell('Commit scrape artifacts');
  execFileSync('bash', ['-e', '-c', commitShell], { cwd: checkout, env: { ...env, ...prepared }, stdio: 'pipe' });
  assert.equal(git('rev-parse', 'HEAD'), git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0]);
  const files = git('ls-tree', '-r', '--name-only', 'HEAD').split('\n');
  assert.ok(files.includes('pipeline/state.json.gz')); assert.ok(!files.includes('pipeline/state.json'));
  const committed = Buffer.from(execFileSync('git', ['show', 'HEAD:pipeline/state.json.gz'], { cwd: checkout, maxBuffer: 100 * 1024 * 1024 }));
  assert.equal(hash(gunzipSync(committed)), hash(expected));
  for (const row of git('ls-tree', '-rl', 'HEAD').split('\n')) {
    const size = Number(row.trim().split(/\s+/)[3]);
    assert.ok(size < 100 * 1024 * 1024, `No committed artifact exceeds GitHub's limit: ${row}`);
  }
  // A fresh checkout selects precisely the state that was pushed, without an environment override.
  const next = path.join(root, 'next');
  execFileSync('git', ['clone', '-b', 'main', remote, next], { stdio: 'pipe' });
  assert.equal(hash(gunzipSync(fs.readFileSync(defaultStateFile(path.join(next, 'pipeline'))))), hash(expected));
  // Run the next scheduled preparation and default CLI from the actual fresh clone.
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(next, 'node_modules'));
  fs.writeFileSync(githubEnv, '');
  const nextEnv = { ...env, GITHUB_WORKSPACE: next };
  execFileSync('bash', ['-e', '-c', shell('Prepare versioned ingestion state in isolation')], { cwd: next, env: nextEnv, stdio: 'pipe' });
  const nextPrepared = preparedEnvironment();
  assert.equal(hash(gunzipSync(fs.readFileSync(nextPrepared.PIPELINE_STATE))), hash(expected));
  execFileSync('bash', ['-e', '-c', commitShell], { cwd: next, env: { ...nextEnv, ...nextPrepared }, stdio: 'pipe' });
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: next, encoding: 'utf8' }).trim(), '');
  const inventory = JSON.parse(execFileSync(path.join(next, 'node_modules/.bin/ts-node'),
    ['--project', 'tsconfig.server.json', 'scripts/retained-inventory.ts'], { cwd: next, env: nextEnv, encoding: 'utf8' }));
  assert.equal(inventory.counts.observations, Object.keys(original.observations).length);
  assert.equal(inventory.counts.overrides, original.overrides.length);
  console.log('Actual workflow preparation/export/commit/local-push, fresh default checkout and repeat passed; full state hash exact');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
