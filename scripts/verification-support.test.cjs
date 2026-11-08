const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const proof = require('./verification-support.cjs');

test('evidence rejects zero checks, source changes and stale results while retaining failed controls', async () => {
  const previous = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-contract-'));
  const inherited = Object.entries(process.env).filter(([name]) => name.startsWith('GIT_'));
  try {
    // Git hooks export paths into the enclosing checkout; fixtures must own their repository.
    for (const [name] of inherited) delete process.env[name];
    process.chdir(root);
    const git = (...args) => execFileSync('git', args, { stdio: 'pipe' });
    git('init');
    assert.equal(fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()), fs.realpathSync(root));
    fs.writeFileSync('.gitignore', 'tmp/\n'); fs.writeFileSync('source.txt', 'before');
    git('add', '.'); git('-c', 'user.name=Verification fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
    const empty = proof.begin('empty', {}, []); empty.record.cleanup = 'completed';
    assert.equal((await proof.finish(empty, () => {})).status, 'failed');
    const passed = proof.begin('recorded', {}, []);
    await proof.finish(passed, async () => { await proof.check(passed, 'observable-result', () => assert.equal(2 + 2, 4)); passed.record.cleanup = 'completed'; });
    assert.equal(proof.evidence(passed.record.id).sourceMatches, true);
    process.env.GIT_DIR = path.join(root, 'wrong-hook-directory');
    assert.equal(proof.evidence(passed.record.id).sourceMatches, true, 'hook paths cannot redirect source identity');
    delete process.env.GIT_DIR;
    const changed = proof.begin('changed', {}, []);
    await proof.finish(changed, async () => { await proof.check(changed, 'changed-source', () => fs.writeFileSync('source.txt', 'after')); changed.record.cleanup = 'completed'; });
    assert.equal(changed.record.status, 'failed');
    assert.equal(proof.evidence(passed.record.id).sourceMatches, false);
    const control = proof.begin('control', {}, []);
    await proof.finish(control, async () => { try { await proof.check(control, 'deliberate-fault', () => assert.fail('fault')); } finally { control.record.cleanup = 'completed'; } });
    assert.equal(proof.evidence(control.record.id).status, 'failed');
    assert.equal(proof.evidence(control.record.id).checks[0].status, 'failed');
    assert.throws(() => proof.evidence('../../source.txt'), /invalid_run_id/);
  } finally {
    process.chdir(previous);
    for (const [name, value] of inherited) process.env[name] = value;
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
