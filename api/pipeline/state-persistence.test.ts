import assert from 'assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { PipelineStore } from './store';
import { defaultStateFile, loadStateFile } from './state-file';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-state-persistence-'));
try {
  for (const name of ['state.json', 'state.json.gz', 'custom-history.json', 'custom-history.json.gz']) {
    const file = path.join(root, name); const store = new PipelineStore(file);
    assert.ok(store.acquireLease('writer'));
    const rival = new PipelineStore(file);
    assert.equal(rival.acquireLease('rival'), false);
    store.transaction(() => {
      store.saveResource('original-evidence', { labels: ['Ä', '🎬'], absent: null, unknown: {}, nested: [{ original: true }] }, '2026-10-18T12:00:00Z');
      store.addOverride({ subject: 'record:one', action: 'patch', patch: { runtime: 123 }, actor: 'local', reason: 'Verified edition', evidenceFingerprint: 'abc' });
    });
    const expected = loadStateFile(file);
    const bytes = fs.readFileSync(file);
    if (name.endsWith('.gz')) assert.deepEqual(JSON.parse(gunzipSync(bytes).toString('utf8')), expected);
    else assert.deepEqual(JSON.parse(bytes.toString('utf8')), expected);
    store.close(); assert.equal(fs.existsSync(file + '.lock'), false);
    const reopened = new PipelineStore(file);
    assert.deepEqual(reopened.resource('original-evidence'), store.resource('original-evidence'));
    assert.deepEqual(reopened.allOverrides(), store.allOverrides());
    assert.ok(reopened.acquireLease('reopened'));
    // The filesystem boundary fails before the atomic rename; previous bytes and in-memory transaction survive.
    for (const operation of ['writeFileSync', 'fsyncSync', 'renameSync'] as const) {
      assert.ok(reopened.acquireLease('reopened'));
      const filesystem = fs as any, saved = filesystem[operation];
      try {
        filesystem[operation] = () => { throw new Error(`fixture ${operation} failure`); };
        assert.throws(() => reopened.transaction(() => reopened.saveResource('lost', 'must roll back')), /fixture .* failure/);
      } finally { filesystem[operation] = saved; reopened.close(); }
      assert.deepEqual(fs.readFileSync(file), bytes);
      assert.equal(reopened.resource('lost'), null);
      assert.deepEqual(fs.readdirSync(root).filter(name => name.endsWith('.tmp') || name.endsWith('.lock')), []);
    }
    const historical = { ...expected, schemaVersion: 1 };
    fs.writeFileSync(file, name.endsWith('.gz') ? gzipSync(JSON.stringify(historical)) : JSON.stringify(historical));
    assert.deepEqual(new PipelineStore(file).allOverrides(), store.allOverrides());
    assert.throws(() => new PipelineStore(file).acquireLease('legacy'), /migrat/i);
    assert.equal(fs.existsSync(file + '.lock'), false);
    fs.unlinkSync(file);
  }
  for (const bad of [Buffer.from('not gzip'), gzipSync('{}'), gzipSync('not JSON'), gzipSync('{}').subarray(0, 12)]) {
    const file = path.join(root, 'broken.json.gz'); fs.writeFileSync(file, bad);
    assert.throws(() => new PipelineStore(file), /Invalid pipeline state file.*refusing to overwrite/i);
    assert.deepEqual(fs.readFileSync(file), bad);
    assert.equal(fs.existsSync(file + '.lock'), false);
    fs.unlinkSync(file);
  }
  const compressed = path.join(root, 'state.json.gz'), plain = path.join(root, 'state.json');
  assert.equal(defaultStateFile(root), compressed, 'A new checkout chooses gzip');
  fs.writeFileSync(plain, 'legacy'); assert.equal(defaultStateFile(root), plain);
  fs.writeFileSync(compressed, 'compressed');
  assert.throws(() => defaultStateFile(root), /Both state.json and state.json.gz/);
  const custom = path.join(root, 'intentional.json'); const selected = process.env.PIPELINE_STATE;
  try {
    process.env.PIPELINE_STATE = custom;
    const explicit = new PipelineStore(); assert.ok(explicit.acquireLease('exact-path')); explicit.transaction(() => explicit.saveResource('selected', true)); explicit.close();
    assert.equal(new PipelineStore(custom).resource('selected')?.data, true, 'Explicit environment paths retain plain JSON behavior');
  } finally { if (selected === undefined) delete process.env.PIPELINE_STATE; else process.env.PIPELINE_STATE = selected; }

  // A long-lived default reader must not keep using an obsolete selection after conversion.
  const checkout = path.join(root, 'default-reader'); fs.mkdirSync(checkout);
  const repository = path.join(__dirname, '../..');
  for (const name of ['api', 'shared', 'src', 'tsconfig.server.json'])
    fs.cpSync(path.join(repository, name), path.join(checkout, name), { recursive: true });
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(checkout, 'node_modules'));
  fs.mkdirSync(path.join(checkout, 'pipeline'));
  const defaultFile = path.join(checkout, 'pipeline/state.json.gz');
  const seeded = new PipelineStore(defaultFile); assert.ok(seeded.acquireLease('seed'));
  seeded.transaction(() => seeded.saveResource('proof', 'retained')); seeded.close();
  const env: NodeJS.ProcessEnv = { ...process.env, TS_NODE_PROJECT: path.join(checkout, 'tsconfig.server.json') };
  delete env.PIPELINE_STATE;
  execFileSync(process.execPath, ['-r', path.join(repository, 'node_modules/ts-node/register'), '-e', `
    const fs=require('fs'), assert=require('assert/strict'), z=require('zlib');
    const Store=require('./api/pipeline/store').PipelineStore;
    const store=new Store();
    assert.equal(store.resource('proof').data, 'retained');
    const original=fs.readFileSync('pipeline/state.json.gz');
    fs.writeFileSync('pipeline/state.json', z.gunzipSync(original));
    assert.throws(()=>store.refresh(), /Both state.json and state.json.gz/, 'Existing default readers also reject ambiguous histories');
    fs.unlinkSync('pipeline/state.json.gz');
    assert.throws(()=>store.refresh(), /state path changed/, 'A removed default file cannot become a silent blank store');
    assert.equal(new Store().resource('proof').data, 'retained');
  `], { cwd: checkout, env, stdio: 'pipe' });

  console.log('Real gzip/plain persistence, exact reload/corrections, v1 reads, corruption refusal, atomic failure/lease cleanup and default/explicit selection passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
