import type { Diagnostic, FilmDetailIdentity, SourceCollection } from '../../shared/contracts';
import { z } from 'zod';

export type SourceCapability = 'screenings' | 'film-details' | 'venue-details';
export type RequestPurpose = 'listing' | 'film' | 'venue';
const label = z.string().trim().min(1);
const limit = z.number().int().nonnegative();
export const SourceInstanceSchema = z.object({ id: label, adapterId: label, enabled: z.boolean(), cacheIdentity: label,
  config: z.record(z.string(), z.any()), limits: z.object({ requests: limit, filmDetails: limit, venueDetails: limit,
    attempts: z.number().int().min(1).max(5).optional(), requestTimeoutMs: z.number().int().positive().optional(),
    collectionTimeoutMs: z.number().int().positive().optional(), requestIntervalMs: z.number().int().nonnegative().optional() }),
  legacyCache: z.boolean().optional(), retainedFile: label.optional() });
export type SourceInstance = z.infer<typeof SourceInstanceSchema>;
export interface SourceRequest {
  url: string; method?: 'GET' | 'POST'; body?: URLSearchParams; purpose?: RequestPurpose;
  headers?: Record<string, string>; timeout?: number; signal?: AbortSignal;
}
export interface SourceResponse { body: string; status: number; headers: Record<string, any> }
export interface SourceCache {
  get(key: string): { data: any; fetchedAt: string } | undefined;
  set(key: string, data: any, fetchedAt: string): void;
}
export interface SourceDependencies {
  request(request: SourceRequest): Promise<SourceResponse>;
  cache: SourceCache; now(): string; diagnostic(diagnostic: Diagnostic): void;
  /** Non-mutating, exactly attributed original descriptions, scoped to the source instance. */
  filmDetailIdentities?(source: string, details: { url: string; fetchedAt: string; fields: Record<string, any> }): FilmDetailIdentity[];
  wait?(milliseconds: number): Promise<void>;
  network?: boolean; force?: boolean; signal?: AbortSignal;
  /** Hand off usable acquisition progress before optional work or another page can fail.
   *  A function is built only if acquisition stops early, for progress that is expensive to snapshot. */
  progress?(collection: SourceCollection | (() => SourceCollection)): void;
}
export class SourcePersistenceError extends Error {}
export interface FilmDetailExtractor {
  accepts(url: URL): boolean;
  extract(html: string, url: string): { fields: Record<string, any>; creditsChecked: boolean };
}
export interface VenueDetailExtractor {
  accepts(url: URL): boolean;
  extract(html: string, url: string): Record<string, string> | null;
  needsLookup(cinema: any): boolean;
  cacheUsable(data: any): boolean;
}
export interface SourceAdapter {
  id: string; extractionVersion: string; capabilities: readonly SourceCapability[];
  allows(url: URL, purpose: RequestPurpose, instance: SourceInstance): boolean;
  collect(instance: SourceInstance, dependencies: SourceDependencies): Promise<SourceCollection>;
  replay?(raw: unknown, instance: SourceInstance): SourceCollection;
  film?: FilmDetailExtractor; venue?: VenueDetailExtractor;
}
