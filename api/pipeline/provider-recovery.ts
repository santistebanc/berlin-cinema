import type TmdbClient from '../tmdb-client';
import { SourcePersistenceError } from '../sources/types';
import type { Diagnostic } from '../../shared/contracts';
import type { VenueGeocoder, GeoLookup } from './geocoding';
import { failureDiagnostic } from './outcomes';
import type { DecisionModel } from './domain';

export class OptionalProviderFailure extends Error {}

export function recoverableModel(client: DecisionModel | null, diagnostic: (value: Diagnostic) => void): DecisionModel | null {
  if (!client) return client;
  let unavailable = false;
  return { ...client, async decide(request) {
    try {
      if (unavailable) throw new OptionalProviderFailure('Optional decision provider is unavailable.');
      return await client.decide(request);
    } catch (error) {
      if (error instanceof SourcePersistenceError) throw error;
      unavailable = true;
      diagnostic({ ...failureDiagnostic('decision-model', 'optional-provider-unavailable', 'Optional decision provider is unavailable.',
        'Use deterministic rules, retained accepted decisions and applicable corrections; abstain on unresolved choices.', true), scope: { task: request.task } });
      throw new OptionalProviderFailure('Optional decision provider is unavailable.');
    }
  } };
}

export function recoverableGeocoder(client: VenueGeocoder | undefined, diagnostic: (value: Diagnostic) => void): VenueGeocoder | undefined {
  if (!client) return client;
  let unavailable: GeoLookup | undefined;
  return { async lookup(input) {
    let result: GeoLookup;
    try { result = unavailable ?? await client.lookup(input); }
    catch (error) {
      if (error instanceof SourcePersistenceError) throw error;
      result = { status: 'request-failed', reason: 'Optional location provider is unavailable.', candidates: [] };
    }
    if (['request-failed', 'boundary-unavailable', 'budget-exhausted'].includes(result.status)) {
      if (result.status === 'request-failed') unavailable = result;
      diagnostic({ ...failureDiagnostic('geocoding', 'optional-provider-unavailable', result.reason,
        'Retain established location evidence; exclude locations which still lack verification.', true), scope: { cinema: input.name, address: input.address ?? null } });
    }
    return result;
  } };
}

/** Transport failures stop new optional lookups; evidence selection still belongs to enrichment. */
export function recoverableMetadata(client: TmdbClient | null): TmdbClient | null {
  if (!client) return client;
  let unavailable: OptionalProviderFailure | undefined;
  return new Proxy(client, { get(target, property) {
    const value = Reflect.get(target, property);
    if (!['candidates', 'getMovieDetails', 'enrichSelected'].includes(String(property)) || typeof value !== 'function')
      return typeof value === 'function' ? value.bind(target) : value;
    return async (...args: any[]) => {
      if (unavailable) throw unavailable;
      const before = target.retrievalErrors?.().length ?? 0;
      try {
        const result = await value.apply(target, args);
        if ((target.retrievalErrors?.().length ?? 0) > before) throw new Error('Optional metadata retrieval failed.');
        return result;
      } catch (error) {
        if (error instanceof SourcePersistenceError) throw error;
        unavailable = new OptionalProviderFailure('Optional metadata provider is unavailable.');
        throw unavailable;
      }
    };
  } });
}
