import type { SourceAdapter } from '../types';
import type { SourceRecord } from '../../../shared/contracts';

/** Fixture-only example: two cinemas share extraction code and emit native source records. */
export const fixtureCinemaAdapter: SourceAdapter = {
  id: 'fixture-cinema', extractionVersion: 'fixture-1', capabilities: ['screenings'],
  allows: url => url.origin === 'https://fixture.test',
  async collect(instance, deps) {
    const sourceUrl = `https://fixture.test/${instance.config.cinema}`;
    const response = await deps.request({ url: sourceUrl });
    const raw = JSON.parse(response.body);
    const observedAt = raw.observedAt ?? deps.now();
    const record = (kind: SourceRecord['kind'], recordId: string, originalLabel: string, data: any): SourceRecord => ({
      kind, recordId, data, fields: {}, provenance: { sourceInstanceId: instance.id, recordId, originalLabel,
        sourceUrl, observedAt, fetchedAt: deps.now(), extractionVersion: 'fixture-1', upstreamLineage: [] } } as SourceRecord);
    return { schemaVersion: 1, sourceInstanceId: instance.id, adapterId: 'fixture-cinema', extractionVersion: 'fixture-1',
      observedAt, status: 'fresh', diagnostics: [],
      records: [record('listing', raw.film.id, raw.film.title, { rawTitle: raw.film.title, url: raw.film.url }),
        record('venue', raw.cinema.id, raw.cinema.name, { name: raw.cinema.name, address: raw.cinema.address }),
        ...raw.screenings.map((screening: any) => record('screening', screening.id, raw.film.title,
          { ...screening, listingRecordId: raw.film.id, venueRecordId: raw.cinema.id }))],
      coverage: [{ sourceInstanceId: instance.id, cinemaRecordIds: [raw.cinema.id], dateRange: null,
        filters: {}, status: 'complete', emptyProgrammeConfirmed: raw.screenings.length === 0 }],
    };
  },
};
