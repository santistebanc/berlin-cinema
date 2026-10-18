import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { decodeState, encodeState, configuredStateFile, STATE_NAME } from '../api/pipeline/state-file';
import { migrateState } from '../api/pipeline/state-format';
import { configuredRegistry } from '../api/sources/defaults';
import type { SourceRegistry } from '../api/sources/registry';
import { CollectionEnvelopeSchema } from '../shared/contracts';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export interface MigrationOptions { stateFile: string; dataDir: string; output: string; registry: SourceRegistry }
interface FileEntry { file: string; sha256: string }
interface Manifest { schemaVersion: 1; migration: 'ingestion-state-v1-v2'; inputs: FileEntry[]; outputs: FileEntry[];
  configurationHash: string; stateVersion: number; missingRetainedSources: string[]; unconfiguredRetainedFiles: string[]; diagnostics: any[] }
const write = (root: string, name: string, bytes: Buffer | string): FileEntry => {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx' }); return { file: name, sha256: hash(bytes) };
};
function verify(root: string, entries: FileEntry[]) {
  for (const entry of entries) {
    if (!['state.json', STATE_NAME, 'data'].includes(entry.file.split('/')[0]) || entry.file.split('/').some(p => p === '..')
      || hash(fs.readFileSync(path.join(root, entry.file))) !== entry.sha256) throw new Error(`Migration checksum/path mismatch: ${entry.file}`);
  }
}
function createBundle(output: string, action: (staging: string) => void) {
  if (fs.existsSync(output)) throw new Error('Output exists; refusing to overwrite recovery data');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const staging = `${output}.${randomUUID()}.staging`;
  fs.mkdirSync(staging);
  try { action(staging); fs.renameSync(staging, output); }
  finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true }); }
}

/** Explicit copy migration. Inputs and the previous publication are never written. */
export function migrateIngestion(options: MigrationOptions): Manifest {
  const { stateFile, dataDir, registry } = options; const output = path.resolve(options.output);
  if (fs.existsSync(`${stateFile}.lock`)) throw new Error('Pipeline writer lock exists; stop writers before migration');
  const stateBytes = fs.readFileSync(stateFile); const state = migrateState(decodeState(stateBytes, stateFile));
  const originalName = stateFile.endsWith('.gz') ? STATE_NAME : 'state.json';
  const prior = fs.existsSync(output) ? JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')) : undefined;
  // Existing plain migration bundles remain repeatable; newly prepared bundles use gzip.
  const outputName = prior?.outputs?.some((entry: FileEntry) => entry.file === 'state.json') ? 'state.json' : STATE_NAME;
  const originals = new Map<string, Buffer>([[originalName, stateBytes]]);
  const converted = new Map<string, string | Buffer>([[outputName, encodeState(state, outputName)]]);
  const missingRetainedSources: string[] = []; const diagnostics: any[] = [];
  for (const instance of registry.instances) {
    const name = instance.retainedFile ?? `${encodeURIComponent(instance.cacheIdentity)}-collection.json`;
    if (path.basename(name) !== name) throw new Error('Retained source filename must be a basename');
    const file = path.join(dataDir, name);
    if (!fs.existsSync(file)) { missingRetainedSources.push(instance.id); continue; }
    const bytes = fs.readFileSync(file); const raw = JSON.parse(bytes.toString('utf8'));
    if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) throw new Error(`Unsupported raw version: ${instance.id}`);
    const collection = raw.schemaVersion === 1 ? raw : registry.adapter(instance).replay?.(raw, instance);
    const validated = CollectionEnvelopeSchema.safeParse(collection);
    if (!validated.success || collection.sourceInstanceId !== instance.id || collection.adapterId !== instance.adapterId)
      throw new Error(`Invalid retained source envelope: ${instance.id}`);
    // Keep original records (including rejected siblings) and diagnostics for ingestion's isolation boundary.
    // Cached historical declarations can never establish a fresh complete refresh.
    const migrated = { ...collection, status: 'cached', coverage: collection.coverage.map((scope: any) => ({ ...scope, status: 'partial' })) };
    diagnostics.push(...collection.diagnostics);
    originals.set(`data/${name}`, bytes); converted.set(`data/${name}`, JSON.stringify(migrated) + '\n');
  }
  const unconfiguredRetainedFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter(name => name.endsWith('.json')
    && fs.statSync(path.join(dataDir, name)).isFile() && !originals.has(`data/${name}`)).sort() : [];
  for (const name of unconfiguredRetainedFiles) {
    const bytes = fs.readFileSync(path.join(dataDir, name));
    originals.set(`data/${name}`, bytes); converted.set(`data/${name}`, bytes);
  }
  const inputs = [...originals].map(([file, bytes]) => ({ file, sha256: hash(bytes) }));
  const outputs = [...converted].map(([file, bytes]) => ({ file, sha256: hash(bytes) }));
  const manifest: Manifest = { schemaVersion: 1, migration: 'ingestion-state-v1-v2', inputs, outputs,
    configurationHash: hash(JSON.stringify(registry.instances)), stateVersion: state.schemaVersion, missingRetainedSources, unconfiguredRetainedFiles, diagnostics };
  if (fs.existsSync(output)) {
    if (JSON.stringify(prior) !== JSON.stringify(manifest)) throw new Error('Migration inputs/configuration changed; use a new output directory');
    verify(output, outputs); verify(path.join(output, 'original'), inputs); return manifest;
  }
  createBundle(output, staging => {
    for (const [name, bytes] of originals) write(path.join(staging, 'original'), name, bytes);
    for (const [name, bytes] of converted) write(staging, name, bytes);
    // Detect an acquisition/state writer changing any input during preparation.
    for (const [name, bytes] of originals) {
      const file = name === originalName ? stateFile : path.join(dataDir, name.slice(5));
      if (hash(fs.readFileSync(file)) !== hash(bytes) || fs.existsSync(`${stateFile}.lock`)) throw new Error('Migration inputs changed; stop writers and retry');
    }
    write(staging, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  });
  return manifest;
}

/** Restore into a separate directory; switching the operational paths is a deliberate operator step. */
export function restoreIngestion(bundle: string, output: string) {
  const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.migration !== 'ingestion-state-v1-v2') throw new Error('Unsupported migration manifest');
  const original = path.join(bundle, 'original'); verify(original, manifest.inputs);
  createBundle(path.resolve(output), staging => { for (const entry of manifest.inputs) write(staging, entry.file, fs.readFileSync(path.join(original, entry.file))); });
}
if (require.main === module) {
  try {
    const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
    const output = arg('--output'); if (!output) throw new Error('Required: --output NEW_DIRECTORY');
    if (arg('--restore')) restoreIngestion(arg('--restore')!, output);
    else {
      const stateFile = arg('--state') ?? configuredStateFile(); const dataDir = arg('--data');
      if (!dataDir) throw new Error('Required: --state FILE --data DIRECTORY --output NEW_DIRECTORY');
      console.log(JSON.stringify(migrateIngestion({ stateFile, dataDir, output, registry: configuredRegistry() }), null, 2));
    }
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
