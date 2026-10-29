import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import path from 'path';
import { loadStateFile, defaultStateFile } from '../api/pipeline/state-file';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';
import { translateLegacyBatch } from '../api/pipeline/observations';
import { defaultRegistry } from '../api/sources/defaults';
import { retainedDependencies } from '../api/sources/runtime';
import { migrateIngestion, restoreIngestion } from './migrate-ingestion';

const NOW = '2026-10-15T10:00:00Z';
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-migration-'));
  try {
    const stateFile = path.join(root, 'state.json');
    const rawDir = path.join(root, 'raw'); fs.mkdirSync(rawDir);
    fs.writeFileSync(path.join(rawDir, 'retired-provider.json'), '{"historical":"unconfigured original bytes"}\n');
    const raw = { scrapedAt: NOW, complete: true, movies: [{ title: 'Retained Film', director: 'A Director', year: '2026',
      url: 'https://www.critic.de/movie/retained/', runtime: 120, listingFields: { runtime: null, year: null },
      sourceDetails: { url: 'https://www.critic.de/movie/retained/', fetchedAt: NOW, fields: { runtime: 120, year: '2026' } },
      cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
      showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: '20:00' }] }] };
    const store = new PipelineStore(stateFile);
    const before = await runPipeline({ store, collections: [translateLegacyBatch({ source: 'critic.de', observedAt: NOW,
      status: 'fresh', complete: true, movies: raw.movies }) as any], now: NOW, network: false, model: null,
      tmdb: null, osm: [], publish: false, audit: false });
    assert.ok(store.acquireLease('prepare-historical-copy'));
    store.transaction(() => {
      store.addOverride({ subject: `entity:${before.movies[0].id}`, action: 'patch', patch: { runtime: 99 }, reason: 'Checked edition', actor: 'local', evidenceFingerprint: 'retained' });
      store.saveResource('tmdb-detail:123', { details: { id: 123, title: 'Retained Film' }, verified: true }, NOW);
    }); store.close();
    const original: any = JSON.parse(fs.readFileSync(stateFile, 'utf8')); original.schemaVersion = 1;
    for (const value of Object.values(original.observations) as any[]) { delete value.provenance; delete value.fields; }
    for (const fields of Object.values(original.fields) as any[][]) for (const field of fields) {
      delete field.evidenceRole; field.reason = 'Historical explanation changed independently of authority';
    }
    fs.writeFileSync(stateFile, JSON.stringify(original));
    fs.writeFileSync(path.join(rawDir, 'critic-raw.json'), JSON.stringify(raw));
    const stateBytes = fs.readFileSync(stateFile); const rawBytes = fs.readFileSync(path.join(rawDir, 'critic-raw.json'));
    const output = path.join(root, 'migrated');
    const manifest = migrateIngestion({ stateFile, dataDir: rawDir, output, registry: defaultRegistry });
    assert.deepEqual(manifest.unconfiguredRetainedFiles, ['retired-provider.json']);
    assert.equal(fs.readFileSync(path.join(output, 'data/retired-provider.json'), 'utf8'), '{"historical":"unconfigured original bytes"}\n');
    const migrated = new PipelineStore(path.join(output, 'state.json.gz'));
    assert.deepEqual(loadStateFile(path.join(output, 'state.json.gz')).fields, original.fields,
      'Adding typed evidence roles never rewrites historical selected fields during migration');
    assert.equal(migrated.fields(before.movies[0].id).find(field => field.field === 'runtime')?.evidenceRole, 'source-detail',
      'Historical detail authority is read from retained attribution, independent of reason wording');
    assert.equal(migrated.fields(before.movies[0].id).find(field => field.field === 'year')?.evidenceRole, 'source-detail',
      'Historical string years retain their detail role after the normal numeric year interpretation');
    assert.deepEqual(migrated.entities(), store.entities(), 'Migration preserves public IDs/slugs and established identities');
    assert.deepEqual(migrated.allOverrides(), store.allOverrides(), 'Corrections are retained verbatim');
    assert.deepEqual(migrated.resource('tmdb-detail:123'), store.resource('tmdb-detail:123'));
    assert.deepEqual(migrated.observations().map(o => [o.id, o.subject, o.sourceKey, o.observedAt, o.fetchedAt, o.data]),
      store.observations().map(o => [o.id, o.subject, o.sourceKey, o.observedAt, o.fetchedAt, o.data]));
    assert.ok(migrated.observations().every(o => o.provenance?.upstreamLineage.length === 0), 'Unknown origins stay unknown');
    const replay = await defaultRegistry.collect(retainedDependencies(migrated, defaultRegistry,
      { network: false, now: '2026-10-15T11:00:00Z', dataDir: path.join(output, 'data') }), { retained: true });
    assert.equal(replay[0].observedAt, NOW);
    assert.equal(replay[0].status, 'cached');
    assert.ok(replay[0].coverage.every(c => c.status !== 'complete'));
    assert.deepEqual(migrateIngestion({ stateFile, dataDir: rawDir, output, registry: defaultRegistry }), manifest, 'Repeat is byte-stable and idempotent');
    const legacyBundle = path.join(root, 'legacy-plain-bundle');
    fs.cpSync(output, legacyBundle, { recursive: true });
    const plainBytes = gunzipSync(fs.readFileSync(path.join(legacyBundle, 'state.json.gz')));
    fs.writeFileSync(path.join(legacyBundle, 'state.json'), plainBytes); fs.unlinkSync(path.join(legacyBundle, 'state.json.gz'));
    const legacyManifest = { ...manifest, outputs: manifest.outputs.map(entry => entry.file === 'state.json.gz'
      ? { file: 'state.json', sha256: createHash('sha256').update(plainBytes).digest('hex') } : entry) };
    fs.writeFileSync(path.join(legacyBundle, 'manifest.json'), JSON.stringify(legacyManifest));
    assert.deepEqual(migrateIngestion({ stateFile, dataDir: rawDir, output: legacyBundle, registry: defaultRegistry }), legacyManifest,
      'An existing pre-compression plain migration bundle remains repeatable without rewriting it');
    const restoredLegacy = path.join(root, 'restored-legacy');
    restoreIngestion(legacyBundle, restoredLegacy);
    assert.deepEqual(fs.readFileSync(path.join(restoredLegacy, 'state.json')), stateBytes);
    const preparedState = fs.readFileSync(path.join(output, 'state.json.gz'));
    fs.writeFileSync(path.join(output, 'state.json.gz'), '{}');
    assert.throws(() => migrateIngestion({ stateFile, dataDir: rawDir, output, registry: defaultRegistry }), /checksum/i, 'A modified output cannot masquerade as a repeatable migration');
    fs.writeFileSync(path.join(output, 'state.json.gz'), preparedState);
    fs.writeFileSync(`${stateFile}.lock`, 'test writer');
    assert.throws(() => migrateIngestion({ stateFile, dataDir: rawDir, output: path.join(root, 'locked'), registry: defaultRegistry }), /writer lock/i);
    assert.equal(fs.existsSync(path.join(root, 'locked')), false);
    fs.unlinkSync(`${stateFile}.lock`);
    const second = path.join(root, 'migrated-again');
    migrateIngestion({ stateFile: path.join(output, 'state.json.gz'), dataDir: path.join(output, 'data'), output: second, registry: defaultRegistry });
    assert.deepEqual(fs.readFileSync(path.join(second, 'state.json.gz')), fs.readFileSync(path.join(output, 'state.json.gz')), 'v2 migration is a lossless no-op on identities and timestamps');
    assert.deepEqual(fs.readFileSync(stateFile), stateBytes); assert.deepEqual(fs.readFileSync(path.join(rawDir, 'critic-raw.json')), rawBytes);
    const restored = path.join(root, 'restored'); restoreIngestion(output, restored);
    assert.deepEqual(fs.readFileSync(path.join(restored, 'state.json')), stateBytes);
    assert.deepEqual(fs.readFileSync(path.join(restored, 'data/critic-raw.json')), rawBytes);
    assert.throws(() => new PipelineStore(stateFile).acquireLease('old-writer'), /migrat/i, 'Historical readers cannot silently write unmigrated state');
    assert.equal(fs.existsSync(`${stateFile}.lock`), false);
    for (const corrupt of [{ ...original, schemaVersion: 99 }, { ...original, entities: null },
      { ...original, heads: { broken: { id: 'missing', observedAt: NOW, active: true } } }]) {
      fs.writeFileSync(stateFile, JSON.stringify(corrupt));
      assert.throws(() => migrateIngestion({ stateFile, dataDir: rawDir, output: path.join(root, 'bad'), registry: defaultRegistry }), /invalid|unsupported/i);
      assert.equal(fs.existsSync(path.join(root, 'bad')), false, 'Failed preparation creates no operational output');
      assert.equal(fs.readFileSync(stateFile, 'utf8'), JSON.stringify(corrupt));
    }
    fs.writeFileSync(stateFile, stateBytes);
    const repeatedObservation = structuredClone(original);
    const subject = Object.keys(repeatedObservation.heads)[0];
    repeatedObservation.heads[subject].observedAt = '2026-10-15T11:00:00Z';
    fs.writeFileSync(stateFile, JSON.stringify(repeatedObservation));
    const historicalOutput = path.join(root, 'historical-head');
    migrateIngestion({ stateFile, dataDir: rawDir, output: historicalOutput, registry: defaultRegistry });
    const migratedHead = new PipelineStore(path.join(historicalOutput, 'state.json.gz')).head(subject)!;
    assert.equal(migratedHead.observedAt, '2026-10-15T11:00:00Z');
    assert.equal(migratedHead.provenance?.observedAt, migratedHead.observedAt, 'Original last observation is retained when an unchanged historical observation ID was reused');
    fs.writeFileSync(stateFile, stateBytes);
    fs.writeFileSync(path.join(rawDir, 'critic-raw.json'), JSON.stringify({ ...raw, schemaVersion: 99 }));
    assert.throws(() => migrateIngestion({ stateFile, dataDir: rawDir, output: path.join(root, 'bad'), registry: defaultRegistry }), /Unsupported raw version/);
    await assert.rejects(defaultRegistry.collect(retainedDependencies(migrated, defaultRegistry,
      { dataDir: rawDir, network: false, now: NOW }), { retained: true }), /Unsupported retained source version/, 'Runtime cannot silently treat unsupported raw versions as missing data');
    fs.writeFileSync(path.join(rawDir, 'critic-raw.json'), rawBytes);
    fs.writeFileSync(path.join(output, 'original/state.json'), 'corrupt backup');
    assert.throws(() => restoreIngestion(output, path.join(root, 'bad-restore')), /checksum/i, 'Recovery validates originals before writing');
    assert.equal(fs.existsSync(path.join(root, 'bad-restore')), false);
    // Real pipeline state is not in git; check it only where a local copy exists.
    const representative = defaultStateFile(path.join(__dirname, '../pipeline'));
    if (!fs.existsSync(representative)) { console.log('representative retained state check skipped: no local pipeline state'); return; }
    const retainedState = loadStateFile(representative);
    const representativeOutput = path.join(root, 'representative');
    migrateIngestion({ stateFile: representative, dataDir: path.join(root, 'no-raw'), output: representativeOutput, registry: defaultRegistry });
    const convertedState = loadStateFile(path.join(representativeOutput, 'state.json.gz'));
    for (const key of Object.keys(retainedState).filter(k => !['schemaVersion', 'observations'].includes(k)))
      assert.deepEqual(convertedState[key], retainedState[key], `Representative ${key} remains intact`);
    for (const [id, old] of Object.entries(retainedState.observations) as [string, any][]) {
      const { provenance, fields, ...converted } = convertedState.observations[id];
      const { provenance: _oldProvenance, fields: _oldFields, ...originalObservation } = old;
      assert.deepEqual(converted, originalObservation, `Representative observation ${id} remains immutable`);
      assert.deepEqual(provenance.upstreamLineage, old.provenance?.upstreamLineage ?? []);
    }
    console.log(`representative retained state migrated losslessly: ${Object.keys(retainedState.observations).length} observations, ${retainedState.overrides.length} corrections`);
    console.log('migration preserves identity/corrections/provider evidence, freshness and unknown lineage; repeat and recovery passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
