import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { readState } from './state-format';

export const STATE_NAME = 'state.json.gz';
/** Default discovery never guesses between competing retained histories. Explicit paths are exact. */
export function defaultStateFile(directory = path.join(__dirname, '../../pipeline')): string {
  const plain = path.join(directory, 'state.json'); const compressed = path.join(directory, STATE_NAME);
  if (fs.existsSync(plain) && fs.existsSync(compressed))
    throw new Error('Both state.json and state.json.gz exist; preserve both and select the intended state with PIPELINE_STATE before recovery');
  return fs.existsSync(plain) ? plain : compressed;
}
export const configuredStateFile = () => process.env.PIPELINE_STATE || defaultStateFile();

export function decodeState(bytes: Buffer, filename: string): any {
  try { return readState(JSON.parse((filename.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'))); }
  catch (error) { throw new Error(`Invalid pipeline state file ${filename}; refusing to overwrite it: ${(error as Error).message}`); }
}
export const loadStateFile = (filename: string) => decodeState(fs.readFileSync(filename), filename);
export function encodeState(state: any, filename: string): Buffer {
  const bytes = Buffer.from(JSON.stringify(state) + '\n');
  return filename.endsWith('.gz') ? gzipSync(bytes) : bytes;
}
/** Caller owns the writer lease. Encoding completes before any destination is changed. */
export function writeStateFile(filename: string, state: any) {
  const bytes = encodeState(state, filename);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, filename);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
