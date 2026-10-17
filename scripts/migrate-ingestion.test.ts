import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
      url: 'https://www.critic.de/movie/retained/', cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
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
    fs.writeFileSync(stateFile, JSON.stringify(original));
    fs.writeFileSync(path.join(rawDir, 'critic-raw.json'), JSON.stringify(raw));
    const stateBytes = fs.readFileSync(stateFile); const rawBytes = fs.readFileSync(path.join(rawDir, 'critic-raw.json'));
    const output = path.join(root, 'migrated');
    const manifest = migrateIngestion({ stateFile, dataDir: rawDir, output, registry: defaultRegistry });
    assert.deepEqual(manifest.unconfiguredRetainedFiles, ['retired-provider.json']);
    assert.equal(fs.readFileSync(path.join(output, 'data/retired-provider.json'), 'utf8'), '{"historical":"unconfigured original bytes"}\n');
    const migrated = new PipelineStore(path.join(output, 'state.json'));
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
    const preparedState = fs.readFileSync(path.join(output, 'state.json'));
    fs.writeFileSync(path.join(output, 'state.json'), '{}');
    assert.throws(() => migrateIngestion({ stateFile, dataDir: rawDir, output, registry: defaultRegistry }), /checksum/i, 'A modified output cannot masquerade as a repeatable migration');
    fs.writeFileSync(path.join(output, 'state.json'), preparedState);
    fs.writeFileSync(`${stateFile}.lock`, 'test writer');
    assert.throws(() => migrateIngestion({ stateFile, dataDir: rawDir, output: path.join(root, 'locked'), registry: defaultRegistry }), /writer lock/i);
    assert.equal(fs.existsSync(path.join(root, 'locked')), false);
    fs.unlinkSync(`${stateFile}.lock`);
    const second = path.join(root, 'migrated-again');
    migrateIngestion({ stateFile: path.join(output, 'state.json'), dataDir: path.join(output, 'data'), output: second, registry: defaultRegistry });
    assert.deepEqual(fs.readFileSync(path.join(second, 'state.json')), fs.readFileSync(path.join(output, 'state.json')), 'v2 migration is a lossless no-op on identities and timestamps');
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
    const migratedHead = new PipelineStore(path.join(historicalOutput, 'state.json')).head(subject)!;
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
    const representative = path.join(__dirname, '../pipeline/state.json');
    const retainedState = JSON.parse(fs.readFileSync(representative, 'utf8'));
    const representativeOutput = path.join(root, 'representative');
    migrateIngestion({ stateFile: representative, dataDir: path.join(root, 'no-raw'), output: representativeOutput, registry: defaultRegistry });
    const convertedState = JSON.parse(fs.readFileSync(path.join(representativeOutput, 'state.json'), 'utf8'));
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
