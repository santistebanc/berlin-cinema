import { CollectionEnvelopeSchema, type Diagnostic, type SourceCollection } from '../../shared/contracts';
import { sanitizeAudit } from '../audit-log';
import { SourceInstanceSchema, SourcePersistenceError, type SourceAdapter, type SourceDependencies, type SourceInstance } from './types';
import { retryableRequest, retryRequest, SourceDeadlineError, withinDeadline } from './requests';

export interface CollectionOptions { selected?: string[]; disabled?: string[]; retained?: boolean }

/** Instances own identity/configuration; adapters own acquisition and interpretation. */
export class SourceRegistry {
  private readonly adapters: Map<string, SourceAdapter>;
  readonly instances: readonly SourceInstance[];
  constructor(adapters: SourceAdapter[], instances: SourceInstance[]) {
    instances = instances.map(instance => SourceInstanceSchema.parse(instance));
    this.adapters = new Map(adapters.map(adapter => [adapter.id, adapter]));
    if (this.adapters.size !== adapters.length) throw new Error('Duplicate source adapter');
    if (new Set(instances.map(instance => instance.id)).size !== instances.length) throw new Error('Duplicate source instance');
    if (new Set(instances.map(instance => instance.cacheIdentity)).size !== instances.length) throw new Error('Duplicate source cache identity');
    for (const instance of instances) {
      if (!this.adapters.has(instance.adapterId)) throw new Error(`Unknown source adapter: ${instance.adapterId}`);
      if (!instance.id || !instance.cacheIdentity || Object.values(instance.limits).some(value => !Number.isInteger(value) || value < 0))
        throw new Error(`Invalid source configuration: ${instance.id}`);
    }
    this.instances = structuredClone(instances);
  }
  adapter(instance: SourceInstance): SourceAdapter { return this.adapters.get(instance.adapterId)!; }
  instance(id: string): SourceInstance | undefined { return this.instances.find(instance => instance.id === id); }
  cacheKey(instance: SourceInstance, key: string): string { return instance.legacyCache ? key : `${instance.cacheIdentity}:${key}`; }
  withSelection(options: CollectionOptions): SourceRegistry {
    return new SourceRegistry([...this.adapters.values()], this.instances.map(instance => ({ ...instance,
      enabled: instance.enabled && !options.disabled?.includes(instance.id) && (!options.selected || options.selected.includes(instance.id)) })));
  }
  /** Detail lookups after collection pass cacheAfterDeadline: the deadline then stops only network requests. */
  context(instance: SourceInstance, deps: SourceDependencies, options: { cacheAfterDeadline?: boolean } = {}): SourceDependencies {
    let requests = 0, lastRequestAt = 0;
    // Sources with config.cookies return cookies like a browser, e.g. berlin.de's rate-limit delay token.
    const cookies = new Map<string, string>();
    const remember = (headers: any) => { if (!instance.config.cookies) return;
      for (const cookie of [headers?.['set-cookie'] ?? []].flat() as string[]) {
        const [pair] = cookie.split(';'); const at = pair.indexOf('=');
        if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      } };
    const deadline = Date.now() + (instance.limits.collectionTimeoutMs ?? 120000);
    const check = () => { if (deps.signal?.aborted || Date.now() >= deadline) throw new SourceDeadlineError(); };
    const adapter = this.adapter(instance);
    const key = (value: string) => this.cacheKey(instance, value);
    // During collection a deadline also ends cache work, so it cannot report complete coverage.
    const checkCache = options.cacheAfterDeadline ? () => { if (deps.signal?.aborted) throw new SourceDeadlineError(); } : check;
    return { ...deps, cache: {
      get: value => { checkCache(); try { return deps.cache.get(key(value)); } catch (error) { throw new SourcePersistenceError((error as Error).message); } },
      set: (value, data, at) => { checkCache(); try { deps.cache.set(key(value), data, at); } catch (error) { throw new SourcePersistenceError((error as Error).message); } },
    },
      diagnostic: diagnostic => { if (!deps.signal?.aborted) deps.diagnostic({ ...diagnostic, sourceInstanceId: instance.id }); },
      request: async request => {
        const url = new URL(request.url);
        if (!instance.enabled || deps.network === false) throw new Error('Source network is disabled');
        if (url.protocol !== 'https:' || url.username || url.password || !adapter.allows(url, request.purpose ?? 'listing', instance))
          throw new Error(`Source URL is not allowed: ${url.href}`);
        return retryRequest(request, instance, deps, async request => {
          check();
          if (++requests > instance.limits.requests) throw new Error('Source request limit reached');
          // Space every attempt, including retries, for sources that rate-limit bursts.
          const spacing = lastRequestAt + (instance.limits.requestIntervalMs ?? 0) - Date.now();
          if (spacing > 0 && deps.wait) { await deps.wait(Math.min(spacing, deadline - Date.now())); check(); }
          lastRequestAt = Date.now();
          const timeout = Math.min(request.timeout ?? 20000, instance.limits.requestTimeoutMs ?? 20000, deadline - Date.now());
          const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
          const headers = cookie ? { ...request.headers, Cookie: cookie } : request.headers;
          try {
            const response = await withinDeadline(signal => deps.request({ ...request, headers, timeout, signal }), timeout, deps.signal);
            remember(response.headers); return response;
          } catch (error: any) { remember(error?.response?.headers); throw error; }
        });
      } };
  }
  async collect(deps: SourceDependencies, options: CollectionOptions = {}): Promise<SourceCollection[]> {
    const results = await Promise.allSettled(this.instances.map(async instance => {
      const adapter = this.adapter(instance);
      const empty = (status: SourceCollection['status'], message?: string): SourceCollection => ({ schemaVersion: 1,
        sourceInstanceId: instance.id, adapterId: adapter.id, extractionVersion: adapter.extractionVersion,
        observedAt: deps.now(), status, records: [], coverage: [], diagnostics: [], ...(message ? { message } : {}) });
      if (!instance.enabled || options.disabled?.includes(instance.id) || options.selected && !options.selected.includes(instance.id)) return empty('skipped');
      const cacheKey = `source-collection:${instance.cacheIdentity}`;
      const retained = () => {
        const value = deps.cache.get(cacheKey)?.data;
        return value && CollectionEnvelopeSchema.safeParse(value).success && value.sourceInstanceId === instance.id ? value as SourceCollection : null;
      };
      if (options.retained || deps.network === false) {
        const cached = retained();
        if (!cached) return empty('failed', 'No retained source collection is available');
        const replayed: SourceCollection = { ...structuredClone(cached), status: 'cached', coverage: cached.coverage.map(scope => ({ ...scope, status: 'partial' })) };
        // Collections retained before adapters declared lineage take the adapter's declared origin.
        for (const record of replayed.records) if (!record.provenance.upstreamLineage.length) record.provenance.upstreamLineage = [...(adapter.upstreamLineage ?? [])];
        return replayed;
      }
      let collection: SourceCollection;
      const diagnostics: Diagnostic[] = [];
      let progress: SourceCollection | undefined;
      let pending: (() => SourceCollection) | undefined;
      const accept = (value: SourceCollection) => {
        CollectionEnvelopeSchema.parse(value);
        if (value.sourceInstanceId !== instance.id || value.status !== 'fresh') throw new Error('Invalid acquisition progress');
        // Own a snapshot: timed-out work must not mutate the returned records later.
        progress = structuredClone(value);
      };
      try {
        const collected = await withinDeadline(signal => adapter.collect(instance, this.context(instance, { ...deps, signal,
          progress: value => {
            if (signal.aborted) return;
            if (typeof value === 'function') pending = value;
            else { pending = undefined; accept(value); }
          },
          diagnostic: diagnostic => { diagnostics.push(diagnostic); deps.diagnostic(diagnostic); } })), instance.limits.collectionTimeoutMs ?? 120000);
        CollectionEnvelopeSchema.parse(collected);
        if (collected.sourceInstanceId !== instance.id) throw new Error('Adapter returned a different source instance');
        collection = { ...collected, adapterId: adapter.id, extractionVersion: adapter.extractionVersion,
          diagnostics: [...collected.diagnostics, ...diagnostics] };
      } catch (error) {
        if (error instanceof SourcePersistenceError) throw error;
        // Lazy progress is built now, between the adapter's awaits, so it reflects all evidence applied so far.
        if (pending) { const build = pending; pending = undefined; try { accept(build()); } catch { /* Keep the last accepted snapshot. */ } }
        const message = sanitizeAudit(error instanceof Error ? error.message : 'Source acquisition failed.');
        const diagnostic: Diagnostic = { schemaVersion: 1, category: 'recovery', stage: 'collection',
          code: progress ? 'collection-incomplete' : 'source-failed',
          sourceInstanceId: instance.id, reason: message, retryable: retryableRequest(error),
          fallback: 'Retain eligible evidence and successful sibling sources within their original freshness limits.' };
        deps.diagnostic(diagnostic);
        if (progress) {
          collection = { ...progress, message, coverage: progress.coverage.map(scope => ({ ...scope, status: 'partial', emptyProgrammeConfirmed: false })),
            diagnostics: [...progress.diagnostics, ...sanitizeAudit(diagnostics), diagnostic] };
        } else {
          collection = empty('failed', message);
          collection.diagnostics.push(...sanitizeAudit(diagnostics), diagnostic);
          const cached = retained();
          if (cached) return { ...structuredClone(cached), status: 'cached', message,
            coverage: cached.coverage.map(scope => ({ ...scope, status: 'partial' })), diagnostics: [...cached.diagnostics, ...collection.diagnostics] };
          return collection;
        }
      }
      if (collection.status === 'fresh') deps.cache.set(cacheKey, collection, collection.observedAt);
      return collection;
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return results.map(result => (result as PromiseFulfilledResult<SourceCollection>).value);
  }
}
