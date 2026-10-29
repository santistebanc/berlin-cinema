import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { migrateIngestion, restoreIngestion } from './migrate-ingestion';
import { exportReleaseState } from './export-release-state';
import { defaultRegistry } from '../api/sources/defaults';
import { defaultStateFile, decodeState, loadStateFile } from '../api/pipeline/state-file';
import { migrateState } from '../api/pipeline/state-format';
import { PipelineStore } from '../api/pipeline/store';

const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
// Real pipeline state is not in git; check it only where a local copy exists.
const input = defaultStateFile(path.join(__dirname, '../pipeline'));
if (!fs.existsSync(input)) { console.log('release state check skipped: no local pipeline state'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-release-state-'));
try {
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

  console.log('Release state migration, export and recovery passed; full state hash exact');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
