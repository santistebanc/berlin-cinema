import { sanitizeAudit } from '../audit-log';
import { SourcePersistenceError, type SourceDependencies, type SourceInstance, type SourceRequest, type SourceResponse } from './types';

export class SourceDeadlineError extends Error { readonly code = 'ETIMEDOUT'; constructor() { super('Source acquisition deadline exceeded'); } }

/** Abort cooperative transports and settle even an uncooperative transport/adapter. */
export async function withinDeadline<T>(work: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void;
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => { controller.abort(); reject(new SourceDeadlineError()); };
      if (parent?.aborted) return abort();
      parent?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, Math.max(1, milliseconds));
      Promise.resolve().then(() => work(controller.signal)).then(resolve, reject);
    });
  } finally { clearTimeout(timer!); parent?.removeEventListener('abort', abort!); controller.abort(); }
}

export function retryableRequest(error: any, purpose?: string): boolean {
  return !(error instanceof SourcePersistenceError) && ([408, 425, 429, 500, 502, 503, 504].includes(error?.response?.status)
    || purpose === 'film' && error?.response?.status === 307
    || ['ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNABORTED'].includes(error?.code));
}

/** Shared request attempts always spend the instance's existing request budget. */
export async function retryRequest(request: SourceRequest, instance: SourceInstance, deps: SourceDependencies,
  attempt: (request: SourceRequest) => Promise<SourceResponse>): Promise<SourceResponse> {
  for (let count = 1; ; count++) {
    try {
      const response = await attempt(request);
      if (response.status >= 400 || response.status >= 300 && request.purpose !== 'venue')
        throw { response: { status: response.status, headers: response.headers } };
      return response;
    } catch (error: any) {
      if (error instanceof SourcePersistenceError) throw error;
      const retryable = retryableRequest(error, request.purpose);
      const retry = retryable && !deps.signal?.aborted && count < (instance.limits.attempts ?? 3);
      deps.diagnostic(sanitizeAudit({ schemaVersion: 1, category: 'recovery', stage: 'request', code: retry ? 'request-retry' : 'request-failed',
        sourceInstanceId: instance.id, retryable, reason: error?.response?.status ? `Source request returned HTTP ${error.response.status}.`
          : error instanceof Error ? error.message : 'Source request failed.',
        fallback: retry ? 'Retry the same allowed request within the source budget.' : 'Retain eligible evidence and successful sibling pages.',
        evidence: { url: request.url, purpose: request.purpose ?? 'listing', attempt: count } }));
      if (!retry) throw error;
      const seconds = Number(error?.response?.headers?.['retry-after']);
      // Rate limits without Retry-After need a real pause, not a quick retry.
      const limited = [425, 429].includes(error?.response?.status);
      await deps.wait?.(Number.isFinite(seconds) && seconds > 0 ? Math.min(60000, seconds * 1000) : limited ? 10000 * count : 250 * count);
    }
  }
}
