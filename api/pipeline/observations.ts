import { sanitizeAudit } from '../audit-log';
import { Observation, SourceBatch, fingerprint, normalize } from './domain';
import { PipelineStore } from './store';
import { detailKey } from './source-details';
import { CollectionEnvelopeSchema, CoverageSchema, DiagnosticSchema, EvidenceValue, IngestionResult, ListingDataSchema,
  ScreeningDataSchema, SourceCollection, SourceRecord, SourceRecordSchema, VenueDataSchema } from '../../shared/contracts';
import { sourceDiagnostic, validateLegacyBatch } from './legacy-source';

export function observation(source: string, kind: Observation['kind'], sourceKey: string, data: Record<string, any>,
  observedAt: string, fetchedAt = observedAt): Observation {
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('Source observation needs a valid timestamp');
  const publicData = sanitizeAudit(data);
  const hash = fingerprint(publicData);
  const subject = `${source}:${kind}:${fingerprint(sourceKey).slice(0, 24)}`;
  return { id: `${subject}:${hash.slice(0, 24)}`, subject, source, sourceKey, kind, observedAt, fetchedAt, fingerprint: hash, data: publicData };
}

export function adaptBatch(batch: SourceBatch): Observation[] {
  const validated = validateLegacyBatch(batch);
  return validated.batch ? adaptLegacyBatch(validated.batch) : [];
}

function adaptLegacyBatch(batch: SourceBatch): Observation[] {
  const observations: Observation[] = [];
  if (batch.status === 'failed' || batch.status === 'skipped') return observations;
  for (const raw of batch.movies) {
    const label = raw.rawTitle || raw.title;
    if (typeof label !== 'string' || !label.trim()) continue;
    const listingKey = `${raw.sourceId ?? raw.url ?? normalize(label)}|${label}|${raw.displayTitle ?? ''}`;
    const { showings, cinemas, ...metadata } = raw;
    const listing = observation(batch.source, 'listing', listingKey, { ...metadata, rawTitle: label }, batch.observedAt);
    observations.push(listing);
    const venues = new Map<string, Observation>();
    const venueRows = [...(cinemas ?? []), ...(showings ?? []).filter((s: any) => !(cinemas ?? []).some((c: any) => c.name === s.cinema))
      .map((s: any) => ({ name: s.cinema, address: s.address, url: s.url }))];
    for (const cinema of venueRows) {
      const sourceUrl = cinema.url || (showings ?? []).find((s: any) => s.cinema === cinema.name)?.url || null;
      const venueKey = sourceUrl || normalize(cinema.name);
      const venue = observation(batch.source, 'venue', venueKey, { name: cinema.name,
        address: cinema.address || '', url: sourceUrl, postalCode: cinema.postalCode || null,
        // Scrapers' default city='Berlin' is not evidence of geography.
        explicitCity: cinema.explicitCity ?? null, addressEvidence: cinema.addressEvidence ?? null,
        ...(cinema.websiteUrl && cinema.websiteEvidence ? { websiteUrl: cinema.websiteUrl, websiteEvidence: cinema.websiteEvidence } : {}) }, batch.observedAt);
      observations.push(venue); venues.set(cinema.name, venue);
    }
    for (const showing of showings ?? []) {
      const venue = venues.get(showing.cinema);
      const date = String(showing.date).slice(0, 10);
      const [hour, minute] = String(showing.time).split(':').map(Number);
      if (!venue || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
        || !Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59 || hour < 0 || minute < 0) continue;
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const key = showing.sessionId || `${listing.subject}|${venue.subject}|${date}|${time}|${showing.variant ?? ''}`;
      observations.push(observation(batch.source, 'screening', key, { ...showing, date, time,
        listingSubject: listing.subject, venueSubject: venue.subject, rawTitle: label,
        movieVariants: raw.variants ?? [], sessionId: showing.sessionId ?? null, auditorium: showing.auditorium ?? null }, batch.observedAt));
    }
  }
  return observations;
}

/** Translate retained scraper formats without changing legacy keys or identity evidence. */
export function translateLegacyBatch(input: unknown): SourceCollection | unknown {
  const { batch, source, diagnostics } = validateLegacyBatch(input);
  if (!batch) return { sourceInstanceId: source, diagnostics }; // Fails the envelope, never becomes empty success.
  const adapted = adaptLegacyBatch(batch);
  const rawScreenings = batch.movies.reduce((count, raw) => count + (raw.showings?.length ?? 0), 0);
  if (adapted.filter(record => record.kind === 'screening').length < rawScreenings) {
    batch.complete = false;
    diagnostics.push(sourceDiagnostic(source, 'invalid-record', 'Invalid screening date/time or venue relationship', batch.movies));
  }
  const bySubject = new Map(adapted.map(record => [record.subject, record.sourceKey]));
  // Scraper movie rows repeat shared venues. Retain the established last-row head,
  // keeping displaced evidence inspectable rather than rejecting valid legacy input.
  const heads = new Map<string, Observation>();
  for (const item of adapted) {
    const previous = heads.get(item.subject);
    if (previous && previous.fingerprint !== item.fingerprint) diagnostics.push(sourceDiagnostic(source,
      'legacy-repeated-subject', 'Repeated legacy source subject retains its last-row head', { previous, selected: item }));
    heads.set(item.subject, item);
  }
  const records = [...heads.values()].map(item => {
    const { listingSubject, venueSubject, ...data } = item.data;
    const fields: Record<string, EvidenceValue> = {};
    if (item.kind === 'listing') for (const field of Object.keys(ListingDataSchema.shape)) {
      fields[field] = item.data[field] == null ? { state: 'unknown' } : { state: 'known', value: item.data[field] };
    }
    return { kind: item.kind, recordId: item.sourceKey, fields,
      provenance: { sourceInstanceId: source, recordId: item.sourceKey,
        originalLabel: item.data.rawTitle ?? item.data.name ?? '', observedAt: item.observedAt, fetchedAt: item.fetchedAt,
        extractionVersion: 'legacy-v1', sourceUrl: item.data.url ?? null, upstreamLineage: [] },
      data: item.kind === 'screening' ? { ...data, listingRecordId: bySubject.get(listingSubject), venueRecordId: bySubject.get(venueSubject) } : item.data };
  });
  return { schemaVersion: 1, sourceInstanceId: source, adapterId: source, extractionVersion: 'legacy-v1',
    observedAt: batch.observedAt, status: batch.status, records, diagnostics, message: batch.message,
    coverage: [{ sourceInstanceId: source, cinemaRecordIds: [], dateRange: null, filters: {},
      status: batch.complete ? 'complete' : 'partial', emptyProgrammeConfirmed: batch.complete && rawScreenings === 0 }] };
}

export function ingestBatches(store: PipelineStore, batches: SourceBatch[]): IngestionResult[] {
  return ingestCollections(store, batches.map(translateLegacyBatch));
}

/** New public ingestion boundary. Record failures are isolated; programming/persistence errors propagate. */
export function ingestCollections(store: PipelineStore, inputs: unknown[]): IngestionResult[] {
  return store.transaction(() => inputs.map(input => {
    const source = typeof (input as any)?.sourceInstanceId === 'string' ? (input as any).sourceInstanceId : 'unknown';
    const envelope = CollectionEnvelopeSchema.safeParse(input);
    const diagnostics = [];
    const finish = (result: IngestionResult) => { store.saveResource(`source-validation:${source}`, result); return result; };
    if (!envelope.success) {
      diagnostics.push(sourceDiagnostic(source, 'invalid-envelope', envelope.error.message, input));
      store.saveResource(`source-status:${source}`, { source, status: 'failed', complete: false, message: 'Collection envelope rejected' });
      return finish({ schemaVersion: 1, sourceInstanceId: source, status: 'rejected-source', acceptedRecords: 0,
        safeForWithdrawal: false, coverage: [], diagnostics });
    }
    const collection = envelope.data;
    let unsafe = false;
    for (const diagnostic of collection.diagnostics) {
      const parsed = DiagnosticSchema.safeParse(diagnostic);
      if (parsed.success) { diagnostics.push(parsed.data); if (['invalid-record', 'invalid-coverage'].includes(parsed.data.code)) unsafe = true; }
      else { unsafe = true; diagnostics.push(sourceDiagnostic(source, 'invalid-diagnostic', parsed.error.message, diagnostic)); }
    }
    const coverage = collection.coverage.flatMap(raw => {
      const result = CoverageSchema.safeParse(raw);
      if (result.success && result.data.sourceInstanceId === source) return [result.data];
      unsafe = true; diagnostics.push(sourceDiagnostic(source, 'invalid-coverage', 'Invalid coverage or source reference', raw)); return [];
    });
    const accepted: Observation[] = [];
    const records: SourceRecord[] = [];
    if (collection.status !== 'failed' && collection.status !== 'skipped') for (const raw of collection.records) {
      const item = raw as any;
      // Isolate invalid optional data before parsing the discriminated record.
      const schema = item?.kind === 'listing' ? ListingDataSchema : item?.kind === 'venue' ? VenueDataSchema : item?.kind === 'screening' ? ScreeningDataSchema : null;
      let candidate = item;
      if (schema && item.data && typeof item.data === 'object' && !Array.isArray(item.data)) {
        const data = { ...item.data }; const fields = { ...item.fields };
        for (const [field, value] of Object.entries(fields) as [string, any][]) {
          if (value?.state === 'known') data[field] = value.value;
          else if (['unknown', 'absent', 'failed', 'cleared'].includes(value?.state) && (value.state !== 'unknown' || data[field] != null)) delete data[field];
        }
        for (const [field, fieldSchema] of Object.entries(schema.shape)) {
          if (data[field] === undefined || !fieldSchema.isOptional()) continue;
          const checked = fieldSchema.safeParse(data[field]);
          if (!checked.success) {
            diagnostics.push(sourceDiagnostic(source, 'invalid-field', checked.error.message, data[field], field, item.recordId)); delete data[field];
            fields[field] = { state: 'failed', reason: 'Invalid source field', retryable: false };
          }
        }
        candidate = { ...item, data, fields };
      }
      const parsed = SourceRecordSchema.safeParse(candidate);
      if (!parsed.success || parsed.data.provenance.sourceInstanceId !== source || parsed.data.provenance.recordId !== parsed.data.recordId) {
        unsafe = true; diagnostics.push(sourceDiagnostic(source, 'invalid-record', parsed.success ? 'Provenance identity does not match record/source' : parsed.error.message, raw)); continue;
      }
      records.push(parsed.data);
    }
    const keys = new Map<string, SourceRecord>(); const conflictingKeys = new Set<string>();
    for (const record of records) {
      const key = `${record.kind}:${record.recordId}`;
      if (conflictingKeys.has(key)) continue;
      const previous = keys.get(key);
      if (previous && fingerprint(previous.data) !== fingerprint(record.data)) {
        unsafe = true; keys.delete(key); conflictingKeys.add(key); diagnostics.push(sourceDiagnostic(source, 'invalid-record', 'Conflicting duplicate record identity', record));
      } else keys.set(key, record);
    }
    for (const record of keys.values()) {
      let data = { ...record.data };
      if (record.kind === 'screening') {
        const listing = keys.get(`listing:${record.data.listingRecordId}`); const venue = keys.get(`venue:${record.data.venueRecordId}`);
        if (!listing || !venue) { unsafe = true; diagnostics.push(sourceDiagnostic(source, 'broken-reference', 'Screening requires valid listing and venue records', record)); continue; }
        const { listingRecordId, venueRecordId, ...rest } = record.data;
        data = { ...rest, listingSubject: observation(source, 'listing', listingRecordId, {}, record.provenance.observedAt).subject,
          venueSubject: observation(source, 'venue', venueRecordId, {}, record.provenance.observedAt).subject } as any;
      }
      const item = observation(source, record.kind, record.recordId, data, record.provenance.observedAt, record.provenance.fetchedAt);
      item.provenance = record.provenance; item.fields = record.fields;
      accepted.push(item);
      if (record.kind === 'listing' && record.data.sourceDetails) {
        const details = record.data.sourceDetails;
        store.saveResource(detailKey(details.url), details, details.fetchedAt);
      }
    }
    if (coverage.some(scope => scope.cinemaRecordIds.some(id => !keys.has(`venue:${id}`)))) {
      unsafe = true; diagnostics.push(sourceDiagnostic(source, 'invalid-coverage', 'Coverage references an invalid venue', coverage));
    }
    if (!accepted.some(item => item.kind === 'screening') && coverage.some(scope => scope.status === 'complete' && !scope.emptyProgrammeConfirmed)) {
      unsafe = true; diagnostics.push(sourceDiagnostic(source, 'unconfirmed-empty', 'Empty programme has not been confirmed', coverage));
    }
    const safeForWithdrawal = !unsafe && collection.status === 'fresh' && coverage.length > 0 && coverage.every(scope => scope.status === 'complete');
    const effectiveCoverage = coverage.map(scope => unsafe && scope.status === 'complete' ? { ...scope, status: 'partial' as const } : scope);
    for (const item of accepted) store.observe(item);
    // Expand step: existing whole-source withdrawal remains; scoped reconciliation belongs to #5.
    if (safeForWithdrawal && coverage.some(scope => scope.cinemaRecordIds.length === 0 && scope.dateRange === null && Object.keys(scope.filters).length === 0))
      store.retireMissing(source, new Set(accepted.map(item => item.subject)));
    store.saveResource(`source-status:${source}`, { source, status: collection.status, observedAt: collection.observedAt,
      complete: safeForWithdrawal, message: collection.message ?? null });
    return finish({ schemaVersion: 1, sourceInstanceId: source, status: diagnostics.length ? 'partial' : 'accepted',
      acceptedRecords: accepted.length, safeForWithdrawal, coverage: effectiveCoverage, diagnostics });
  }));
}
