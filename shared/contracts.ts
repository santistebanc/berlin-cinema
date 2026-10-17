import { z } from 'zod';

// Browser-safe, versioned boundary contracts. Server identity/selection policy lives elsewhere.
export const TimestampSchema = z.string().refine(value => /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)), 'Expected an ISO timestamp');
export const DateSchema = z.string().regex(/^\d{4}-\d\d-\d\d$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Invalid calendar date');
export const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const label = z.string().refine(value => !!value.trim(), 'Expected a nonempty label');
const strings = z.array(z.string());
const url = z.url({ protocol: /^https?$/ });
export const ProvenanceSchema = z.object({
  sourceInstanceId: label, recordId: label, originalLabel: z.string(), observedAt: TimestampSchema,
  fetchedAt: TimestampSchema, extractionVersion: label, sourceUrl: url.nullable(),
  upstreamLineage: strings, // Empty means unknown lineage, never verified independence.
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const EvidenceValueSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('known'), value: z.json() }),
  z.object({ state: z.literal('unknown') }),
  z.object({ state: z.literal('absent'), reason: label }),
  z.object({ state: z.literal('failed'), reason: label, retryable: z.boolean() }),
  z.object({ state: z.literal('cleared'), correctionId: label, reason: label }),
]);
export type EvidenceValue = z.infer<typeof EvidenceValueSchema>;
export const DiagnosticSchema = z.object({
  schemaVersion: z.literal(1), category: z.enum(['recovery', 'data-quality', 'actionable']),
  stage: label, code: label, sourceInstanceId: z.string(), recordId: z.string().optional(),
  path: z.string().optional(), reason: label, retryable: z.boolean(), evidence: z.json().optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export const CoverageSchema = z.object({
  sourceInstanceId: label, cinemaRecordIds: strings, dateRange: z.object({ from: DateSchema, to: DateSchema }).nullable(),
  filters: z.record(z.string(), z.union([z.string(), strings, z.boolean()])),
  status: z.enum(['complete', 'partial', 'unknown', 'failed']), emptyProgrammeConfirmed: z.boolean(),
}).refine(value => !value.dateRange || value.dateRange.from <= value.dateRange.to, 'Reversed coverage date range');
export type Coverage = z.infer<typeof CoverageSchema>;

// Passthrough preserves existing, validated scraper extensions during the expand migration.
const listingMetadata = {
  director: z.string().nullable().optional(), cast: strings.nullable().optional(), country: z.string().nullable().optional(),
  year: z.union([z.number().int().positive(), z.string().regex(/^\d{4}$/)]).nullable().optional(),
  altTitle: z.string().nullable().optional(), originalTitle: z.string().nullable().optional(),
  posterUrl: url.nullable().optional(), runtime: z.number().positive().nullable().optional(),
};
export const ListingDataSchema = z.object({
  ...listingMetadata,
  rawTitle: label, title: z.string().nullable().optional(), displayTitle: z.string().nullable().optional(),
  sourceId: z.union([z.string(), z.number()]).nullable().optional(), url: url.nullable().optional(),
  variants: strings.optional(),
  sourceDetails: z.object({ url, fetchedAt: TimestampSchema, fields: z.object(listingMetadata).passthrough(),
    failed: z.boolean().optional(), creditsChecked: z.boolean().optional(), parserVersion: z.number().optional(), reason: z.string().optional() }).passthrough().optional(),
  listingFields: z.object(listingMetadata).passthrough().optional(),
}).passthrough();
export const VenueDataSchema = z.object({ name: label, address: z.string().optional(), url: url.nullable().optional(),
  postalCode: z.string().nullable().optional(), explicitCity: z.string().nullable().optional(),
  websiteUrl: url.optional(), websiteEvidence: z.record(z.string(), z.json()).optional(),
}).passthrough();
export const ScreeningDataSchema = z.object({
  date: DateSchema, time: TimeSchema, listingRecordId: label, venueRecordId: label, rawTitle: z.string().optional(),
  cinema: z.string().optional(), url: url.nullable().optional(), variant: z.string().nullable().optional(),
  movieVariants: strings.optional(), sessionId: z.union([z.string(), z.number()]).nullable().optional(),
  auditorium: z.string().nullable().optional(),
}).passthrough();
const recordBase = { recordId: label, provenance: ProvenanceSchema, fields: z.record(z.string(), EvidenceValueSchema) };
export const SourceRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...recordBase, kind: z.literal('listing'), data: ListingDataSchema }),
  z.object({ ...recordBase, kind: z.literal('venue'), data: VenueDataSchema }),
  z.object({ ...recordBase, kind: z.literal('screening'), data: ScreeningDataSchema }),
]);
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export const CollectionEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), sourceInstanceId: label, adapterId: label, extractionVersion: label,
  observedAt: TimestampSchema, status: z.enum(['fresh', 'cached', 'failed', 'skipped']),
  records: z.array(z.unknown()), coverage: z.array(z.unknown()), diagnostics: z.array(z.unknown()), message: z.string().optional(),
});
export const SourceCollectionSchema = CollectionEnvelopeSchema.extend({
  records: z.array(SourceRecordSchema), coverage: z.array(CoverageSchema), diagnostics: z.array(DiagnosticSchema),
});
export type SourceCollection = z.infer<typeof SourceCollectionSchema>;
export const IngestionResultSchema = z.object({ schemaVersion: z.literal(1), sourceInstanceId: z.string(),
  status: z.enum(['accepted', 'partial', 'rejected-source']), acceptedRecords: z.number().int().nonnegative(),
  safeForWithdrawal: z.boolean(), coverage: z.array(CoverageSchema), diagnostics: z.array(DiagnosticSchema),
});
export type IngestionResult = z.infer<typeof IngestionResultSchema>;

export const ResolvedFieldSchema = z.object({ field: label, value: EvidenceValueSchema, reason: label,
  supportingObservationIds: strings, alternatives: z.array(EvidenceValueSchema), unresolvedQuestions: strings });
export const ResolutionResultSchema = z.object({ schemaVersion: z.literal(1),
  outcome: z.enum(['selected', 'abstained']), entity: z.object({ id: label, kind: z.enum(['film', 'programme', 'venue']), name: label }).nullable(),
  reason: label, supportingObservationIds: strings, conflictingEntityIds: strings,
  fields: z.array(ResolvedFieldSchema), unresolvedQuestions: strings,
});
export type ResolvedField = z.infer<typeof ResolvedFieldSchema>;
export type ResolutionResult = z.infer<typeof ResolutionResultSchema>;

export const ModalitySchema = z.object({ version: z.enum(['original', 'dubbed', 'unknown']),
  spokenLanguage: z.string().nullable(), subtitleLanguage: z.string().nullable(), subtitled: z.boolean().nullable(),
  projection: strings, edition: z.string().nullable(), context: strings, unknown: strings });
export type Modality = z.infer<typeof ModalitySchema>;
export const SourceAliasSchema = z.object({ source: label, subject: label, url: url.nullable(),
  recordId: z.union([z.string(), z.number()]).nullable(), entityId: label, evidenceFingerprint: label,
  labels: strings, provenance: ProvenanceSchema.optional() }).passthrough();
export const PublishedScreeningSchema = z.object({ cinema: label, variants: strings,
  id: z.string().optional(), venueId: z.string().optional(), uncertain: z.boolean().optional(), stale: z.boolean().optional(),
  edition: z.string().nullable().optional(), modality: ModalitySchema.optional(), alternatives: z.array(ModalitySchema).optional(),
  sourceUrls: z.array(url).optional(), observationIds: strings.optional(), lastObservedAt: TimestampSchema.optional(),
  provenance: z.array(ProvenanceSchema).optional(),
}).passthrough();
export const PublishedVenueSchema = z.object({ id: label, name: label,
  address: z.string().optional(), city: z.string().optional(), postalCode: z.string().optional(), url: url.nullable().optional(),
  websiteUrl: url.optional(), latitude: z.number().finite().optional(), longitude: z.number().finite().optional(),
  sourceAliases: z.array(SourceAliasSchema).optional(),
  showtimes: z.array(z.object({ date: DateSchema, times: z.array(TimeSchema), dayOfWeek: z.string().optional() }).passthrough()).optional(),
}).passthrough();
const optionalText = z.string().nullable().optional();
const optionalNumber = z.number().finite().nullable().optional();
export const PublishedMovieSchema = z.object({ title: label, slug: label, id: z.string().optional(),
  kind: z.enum(['film', 'programme']).optional(), identityGroupKey: z.string().optional(),
  identityStatus: z.enum(['verified', 'source-only']).optional(), sourceAliases: z.array(SourceAliasSchema).optional(),
  slugAliases: strings.optional(), sourceTitles: strings.optional(),
  criticTitle: optionalText, altTitle: optionalText, director: optionalText, cast: strings.nullable().optional(), country: optionalText,
  year: optionalNumber, posterUrl: optionalText, url: optionalText,
  variants: strings.default([]), cinemas: z.array(PublishedVenueSchema),
  showings: z.record(DateSchema, z.record(TimeSchema, z.array(PublishedScreeningSchema))),
  originalTitle: optionalText, alternativeTitles: strings.default([]), tmdbTitle: optionalText,
  tagline: optionalText, plot: optionalText, runtime: optionalNumber, rating: optionalNumber,
  imdbRating: optionalNumber, imdbVotes: optionalNumber, voteCount: optionalNumber,
  allRatings: z.array(z.object({ source: z.string(), value: z.string() })).nullable().optional(),
  genres: strings.nullable().optional(), originalLanguage: optionalText, trailerUrl: optionalText,
  imdbId: optionalText, backdropUrl: optionalText, ageRating: optionalText, keywords: strings.default([]),
  directors: strings.optional(), writers: strings.optional(), releaseDate: optionalText, germanReleaseDate: optionalText,
  spokenLanguages: z.array(z.object({ code: z.string().nullable(), name: z.string() })).optional(),
  productionCountries: z.array(z.object({ code: z.string(), name: z.string() })).optional(),
  productionCompanies: z.array(z.object({ id: z.number(), name: z.string(), country: z.string().nullable() })).optional(),
  certifications: z.array(z.object({ country: z.string(), certification: z.string(), releaseType: z.number().optional(), releaseDate: optionalText })).optional(),
  homepage: optionalText, status: optionalText, awards: optionalText, externalIds: z.record(z.string(), z.json()).optional(),
  isSpecial: z.boolean().optional(), tmdbFetched: z.boolean().optional(), omdbFetchedAt: TimestampSchema.optional(),
}).passthrough();
export const PublicSnapshotSchema = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  movies: z.array(PublishedMovieSchema), scrapedAt: TimestampSchema,
  total: z.number().int().nonnegative().optional(), totalMovies: z.number().int().nonnegative().optional(),
}).passthrough().refine(snapshot => (snapshot.total === undefined || snapshot.total === snapshot.movies.length)
  && (snapshot.totalMovies === undefined || snapshot.totalMovies === snapshot.movies.length), 'Movie count does not match snapshot');
export type PublishedMovie = z.infer<typeof PublishedMovieSchema>;
export type PublishedVenue = z.infer<typeof PublishedVenueSchema>;
export type PublishedScreening = z.infer<typeof PublishedScreeningSchema>;
export type PublicSnapshot = z.infer<typeof PublicSnapshotSchema>;
export const PublicationResultSchema = z.object({ schemaVersion: z.literal(1),
  outcome: z.enum(['published', 'degraded', 'preserved-acquisition-failure', 'fatal']),
  snapshot: PublicSnapshotSchema.nullable(), diagnostics: z.array(DiagnosticSchema) });
export type PublicationResult = z.infer<typeof PublicationResultSchema>;

export function parsePublicSnapshot(input: unknown): PublicSnapshot {
  const result = PublicSnapshotSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid public snapshot: ${result.error.issues.map(issue => `${issue.path.join('.') || 'snapshot'}: ${issue.message}`).join('; ')}`);
  return result.data;
}
