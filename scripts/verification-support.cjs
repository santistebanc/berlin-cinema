// Evidence describes the complete tracked and unignored source, including dirty work.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const digest = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
function identity() {
  const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))].sort();
  const hashes = Object.fromEntries(files.map(file => [file, fs.existsSync(file) ? digest(fs.readFileSync(file)) : 'deleted']));
  return { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '', fingerprint: digest(JSON.stringify(hashes)) };
}
function begin(scenario, fixtures, limits) {
  const id = randomUUID();
  const directory = path.resolve('tmp/verification', id);
  fs.mkdirSync(directory, { recursive: true });
  const record = { version: 1, id, scenario, status: 'not-run', source: identity(), fixtures,
    offline: true, environment: { node: process.version, platform: process.platform, arch: process.arch }, checks: [], limits, cleanup: 'pending' };
  const save = () => fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify(record, null, 2));
  save();
  return { record, directory, save };
}
function finish(run, operation) {
  return Promise.resolve().then(() => operation(run)).then(() => {
    if (!run.record.checks.length || run.record.checks.some(c => c.status !== 'passed')) throw new Error('incomplete_checks');
    if (JSON.stringify(identity()) !== JSON.stringify(run.record.source)) throw new Error('source_changed');
    if (run.record.cleanup !== 'completed') throw new Error('cleanup_incomplete');
    run.record.status = 'passed';
  }).catch(error => {
    run.record.status = 'failed';
    run.record.failure = error.code ?? 'scenario_failed';
    fs.writeFileSync(path.join(run.directory, 'failure.txt'), String(error.stack ?? error));
  }).then(() => { run.save(); return run.record; });
}
function check(run, name, operation) {
  const result = { name, status: 'not-run' };
  run.record.checks.push(result); run.save();
  return Promise.resolve().then(operation).then(value => { result.status = 'passed'; return value; })
    .catch(error => { result.status = 'failed'; throw error; });
}
function command(run, name, argv, options = {}) {
  return check(run, name, () => {
    const fd = fs.openSync(path.join(run.directory, name + '.log'), 'w');
    try {
      const result = spawnSync(argv[0], argv.slice(1), { cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env }, stdio: ['ignore', fd, fd], windowsHide: true, timeout: 300000 });
      if (result.error || result.status !== 0) throw new Error('check_failed:' + name);
    } finally { fs.closeSync(fd); }
  });
}
function evidence(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid_run_id');
  const record = JSON.parse(fs.readFileSync(path.join('tmp/verification', id, 'evidence.json'), 'utf8'));
  const current = identity();
  return { ...record, sourceMatches: record.source.commit === current.commit && record.source.fingerprint === current.fingerprint };
}
module.exports = { digest, identity, begin, finish, check, command, evidence };
