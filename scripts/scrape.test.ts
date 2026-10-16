import assert from 'assert/strict';
import { scrape, publishesInMode } from './scrape';
import type { MergeOptions } from './merge';

async function main() {
  const success = async () => {};
  const failure = async () => { throw new Error('Source unavailable'); };
  let merged: MergeOptions | undefined;
  let failures = 0;
  const services = { critic: success, berlin: success,
    merge: async (options: MergeOptions) => { merged = options; },
    recordFailure: () => { failures++; return undefined as any; } };

  await scrape({}, services);
  assert.equal(merged?.publish, true, 'A normal scrape publishes without additional configuration');
  assert.deepEqual(merged?.sources?.map(source => source.status), ['fresh', 'fresh']);

  await scrape({ publish: false }, services);
  assert.equal(merged?.publish, false, 'Explicit shadow runs withhold the public dataset');

  await scrape({}, { ...services, berlin: failure });
  assert.deepEqual(merged?.sources?.map(source => source.status), ['fresh', 'cached']);
  await scrape({}, { ...services, critic: failure });
  assert.deepEqual(merged?.sources?.map(source => source.status), ['failed', 'fresh']);

  merged = undefined;
  await assert.rejects(scrape({}, { ...services, critic: failure, berlin: failure }), /No source returned fresh/);
  assert.equal(merged, undefined, 'An upstream outage must not replace the public dataset');
  assert.equal(failures, 1, 'The failure retains source diagnostics');

  await scrape({ skipBerlinDe: true }, { ...services, berlin: failure });
  assert.deepEqual(merged?.sources?.map(source => source.status), ['fresh', 'skipped']);
  merged = undefined;
  await assert.rejects(scrape({ skipBerlinDe: true }, { ...services, critic: failure }), /No source returned fresh/);
  assert.equal(merged, undefined, 'Skipping one source does not hide failure of the other');

  assert.equal(publishesInMode('live'), true);
  assert.equal(publishesInMode('shadow'), false);
  assert.throws(() => publishesInMode('typo'), /Unsupported PIPELINE_MODE/);
  console.log('scrape publication and outage tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
