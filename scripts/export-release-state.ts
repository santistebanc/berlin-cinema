import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID, createHash } from 'crypto';
import { decodeState, encodeState, STATE_NAME, writeStateFile } from '../api/pipeline/state-file';

/** Export the successful isolated run, holding the same file locks as every store writer. */
export function exportReleaseState(input: string, directory = path.join(__dirname, '../pipeline')) {
  const source = path.resolve(input), target = path.resolve(directory, STATE_NAME), plain = path.resolve(directory, 'state.json');
  if ([target, plain].includes(source)) throw new Error('Export requires a separate prepared state; retain its original recovery bundle');
  const locks: string[] = [], owner = randomUUID();
  fs.mkdirSync(directory, { recursive: true });
  try {
    for (const file of [...new Set([source, target, plain])].sort()) {
      const lock = file + '.lock', descriptor = fs.openSync(lock, 'wx', 0o600);
      locks.push(lock);
      try { fs.writeFileSync(descriptor, JSON.stringify({ owner, pid: process.pid, host: os.hostname() })); }
      finally { fs.closeSync(descriptor); }
    }
    const bytes = fs.readFileSync(source), state = decodeState(bytes, source);
    const compressed = encodeState(state, target);
    if (compressed.length >= 100 * 1024 * 1024) throw new Error('Compressed pipeline state exceeds the GitHub 100 MiB blob limit; preserving previous artifacts');
    // Validate existing histories before replacing them; corrupt state must never become an empty baseline.
    for (const file of [target, plain]) if (fs.existsSync(file)) decodeState(fs.readFileSync(file), file);
    writeStateFile(target, state);
    if (!fs.readFileSync(target).equals(compressed)) throw new Error('Exported state checksum mismatch; preserve the recovery bundle');
    // The replacement has been verified before the obsolete plain artifact can be removed.
    if (fs.existsSync(plain)) fs.unlinkSync(plain);
    return { file: target, bytes: compressed.length, sha256: createHash('sha256').update(compressed).digest('hex') };
  } finally {
    for (const lock of locks.reverse()) fs.unlinkSync(lock);
  }
}
if (require.main === module) {
  try {
    const input = process.env.PIPELINE_STATE;
    if (!input) throw new Error('PIPELINE_STATE must name the successful isolated run to export');
    console.log(JSON.stringify(exportReleaseState(input)));
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
