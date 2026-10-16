import { sanitizeAudit } from '../audit-log';
import { Observation, SourceBatch, fingerprint, normalize } from './domain';
import { PipelineStore } from './store';
import { detailKey } from './source-details';

export function observation(source: string, kind: Observation['kind'], sourceKey: string, data: Record<string, any>,
  observedAt: string, fetchedAt = observedAt): Observation {
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('Source observation needs a valid timestamp');
  const publicData = sanitizeAudit(data);
  const hash = fingerprint(publicData);
  const subject = `${source}:${kind}:${fingerprint(sourceKey).slice(0, 24)}`;
  return { id: `${subject}:${hash.slice(0, 24)}`, subject, source, sourceKey, kind, observedAt, fetchedAt, fingerprint: hash, data: publicData };
}

export function adaptBatch(batch: SourceBatch): Observation[] {
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

export function ingestBatches(store: PipelineStore, batches: SourceBatch[]) {
  store.transaction(() => {
    for (const batch of batches) {
      for (const raw of batch.movies) if (raw.sourceDetails?.url && raw.sourceDetails?.fetchedAt) {
        store.saveResource(detailKey(raw.sourceDetails.url), raw.sourceDetails, raw.sourceDetails.fetchedAt);
      }
      const adapted = adaptBatch(batch);
      const rawScreenings = batch.movies.reduce((count, raw) => count + (raw.showings?.length ?? 0), 0);
      const incomplete = adapted.filter(o => o.kind === 'screening').length < rawScreenings;
      if (incomplete && batch.status === 'fresh') {
        batch.complete = false;
        store.issue({ type: 'invalid-source-rows', subject: `pipeline:source:${batch.source}`, title: `${batch.source}: invalid screening rows retained for review`,
          status: 'open', priority: 85, fingerprint: fingerprint([batch.source, rawScreenings, adapted.filter(o => o.kind === 'screening').length]),
          details: { reason: 'Some date/time/venue values failed validation. Valid new observations are usable, but omissions cannot withdraw previous support.', rawScreenings } });
      }
      for (const item of adapted) store.observe(item);
      if (batch.status === 'fresh' && batch.complete) store.retireMissing(batch.source, new Set(adapted.map(o => o.subject)));
    }
  });
}
