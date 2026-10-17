import axios, { AxiosRequestConfig } from 'axios';
import type { PipelineStore } from '../pipeline/store';
import { SourcePersistenceError, type SourceDependencies } from './types';

/** Transport never follows redirects implicitly. Adapters and detail mechanisms validate each hop. */
export function sourceDependencies(store: PipelineStore, options: { network?: boolean; now?: string; force?: boolean } = {}): SourceDependencies {
  return { network: options.network, force: options.force, now: () => options.now ?? new Date().toISOString(), diagnostic: () => {},
    wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    cache: { get: key => store.resource(key) ?? undefined, set: (key, data, at) => {
      try { store.saveResource(key, data, at); } catch (error) { throw new SourcePersistenceError((error as Error).message); }
    } },
    request: async request => {
      const config: AxiosRequestConfig = { responseType: 'text',
        timeout: request.timeout ?? 20000, signal: request.signal, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
        validateStatus: status => status >= 200 && (request.purpose === 'venue' ? status < 400 : status < 300),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OVBerlin/2.0)', 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8', ...request.headers } };
      const response = request.method === 'POST' ? await axios.post(request.url, request.body, config) : await axios.get(request.url, config);
      return { body: response.data, status: response.status, headers: response.headers };
    } };
}
