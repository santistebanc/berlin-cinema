import assert from 'assert/strict';
import { SourceRegistry } from './registry';
import type { SourceAdapter, SourceDependencies, SourceInstance } from './types';
import type { SourceCollection } from '../../shared/contracts';

const NOW = '2026-10-15T10:00:00Z';
const adapter: SourceAdapter = { id: 'resilience-fixture', extractionVersion: '1', capabilities: ['screenings'], allows: () => true,
  async collect(instance, deps) {
    await deps.request({ url: `https://fixture.test/${instance.id}` });
    return { schemaVersion: 1, sourceInstanceId: instance.id, adapterId: 'resilience-fixture', extractionVersion: '1', observedAt: deps.now(),
      status: 'fresh', records: [], diagnostics: [], coverage: [{ sourceInstanceId: instance.id, cinemaRecordIds: [], dateRange: null,
        filters: {}, status: 'complete', emptyProgrammeConfirmed: true }] };
  } };
const instance = (id: string, limits: any = {}): SourceInstance => ({ id, adapterId: adapter.id, enabled: true, cacheIdentity: id, config: {},
  limits: { requests: 4, filmDetails: 0, venueDetails: 0, ...limits } });
const deps = (request: SourceDependencies['request']): SourceDependencies => ({ request, now: () => NOW, diagnostic: () => {},
  wait: async () => {}, cache: { get: () => undefined, set: () => {} } });
async function main() {
  const registry = new SourceRegistry([adapter], [instance('recover')]);
  let attempts = 0;
  const result = await registry.collect(deps(async () => {
    if (++attempts < 3) throw { response: { status: 503, headers: {} } };
    return { status: 200, headers: {}, body: 'Programme confirmed empty' };
  }));
  assert.equal(result[0].status, 'fresh', 'Retryable acquisition recovers within the configured source budget');
  assert.equal(attempts, 3);
  assert.ok(result[0].diagnostics.some((diagnostic: any) => diagnostic.stage === 'request' && diagnostic.retryable));
  const bounded = new SourceRegistry([adapter], [instance('hung', { requestTimeoutMs: 15, collectionTimeoutMs: 60, attempts: 2 }), instance('healthy')]);
  let aborted = false;
  const deadline = await Promise.race([bounded.collect(deps(async request => {
    if (request.url.endsWith('/hung')) {
      request.signal?.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    }
    return { status: 200, headers: {}, body: 'Confirmed empty' };
  })), new Promise<SourceCollection[]>((_, reject) => setTimeout(() => reject(new Error('Source monopolized the run beyond its deadline')), 250))]);
  assert.deepEqual(deadline.map(item => item.status), ['failed', 'fresh']);
  assert.equal(aborted, true, 'Timed-out transport is aborted');
  let exhaustedAttempts = 0;
  const exhausted = await new SourceRegistry([adapter], [instance('exhausted', { requests: 2, attempts: 5 })]).collect(deps(async () => {
    exhaustedAttempts++;
    throw { response: { status: 503, headers: {} } };
  }));
  assert.equal(exhausted[0].status, 'failed');
  assert.equal(exhaustedAttempts, 2, 'Retries spend the same configured request limit');
  assert.ok(exhausted[0].diagnostics.some((diagnostic: any) => diagnostic.stage === 'request'), 'Exhausted requests retain their request-level diagnostics');
  let permanentAttempts = 0;
  const permanent = await registry.collect(deps(async () => { permanentAttempts++; throw { response: { status: 404 } }; }));
  assert.equal(permanentAttempts, 1, 'Nonretryable failures are not retried');
  assert.equal(permanent[0].diagnostics.find((diagnostic: any) => diagnostic.code === 'source-failed')?.retryable, false);
  const waits: number[] = [];
  let paced = 0;
  const pacedResult = await new SourceRegistry([adapter], [instance('paced', { requestIntervalMs: 6000 })]).collect({ ...deps(async () => {
    if (++paced < 3) throw { response: { status: 425, headers: {} } };
    return { status: 200, headers: {}, body: 'Confirmed empty' };
  }), wait: async milliseconds => { waits.push(milliseconds); } });
  assert.equal(pacedResult[0].status, 'fresh', 'Rate-limited acquisition recovers after pausing');
  assert.deepEqual(waits.filter(wait => wait >= 10000), [10000, 20000], 'Rate limits without Retry-After back off for seconds');
  const spacing = waits.filter(wait => wait < 10000);
  assert.ok(spacing.length === 2 && spacing.every(wait => wait > 0 && wait <= 6000), 'Retries are spaced by the source interval');
  const sentCookies: (string | undefined)[] = [];
  const tokened = await new SourceRegistry([adapter], [{ ...instance('tokened'), config: { cookies: true } }]).collect(deps(async request => {
    sentCookies.push(request.headers?.Cookie);
    if (request.headers?.Cookie !== 'bo_delay_token=abc') throw { response: { status: 403, headers: { 'set-cookie': ['bo_delay_token=abc; HttpOnly; Max-Age=30'] } } };
    return { status: 200, headers: {}, body: 'Confirmed empty' };
  }));
  assert.equal(tokened[0].status, 'fresh', 'A delay token is returned on the retry');
  assert.deepEqual(sentCookies, [undefined, 'bo_delay_token=abc']);
  const expiring = new SourceRegistry([adapter], [instance('expiring', { collectionTimeoutMs: 10 })]);
  const expired = expiring.context(expiring.instances[0], { ...deps(async () => ({ status: 200, headers: {}, body: '' })),
    cache: { get: () => ({ data: 'retained', fetchedAt: NOW }), set: () => {} } }, { cacheAfterDeadline: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(expired.cache.get('detail')?.data, 'retained', 'Cached evidence stays readable after the network deadline');
  await assert.rejects(expired.request({ url: 'https://fixture.test/late' }), /deadline exceeded/, 'Late network requests stop at the deadline');
  console.log('source acquisition resilience acceptance tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
