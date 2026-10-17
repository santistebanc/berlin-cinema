import { Entity, Observation, normalize, FieldValue } from './domain';
import { selectEvidence } from './evidence-policy';
import { parseVenueAddress, venueAddressesMatch } from './addresses';
import { PipelineStore } from './store';
import type { OsmCinema } from '../osm-client';

/** Website enrichment follows an already resolved source link; it never establishes identity. */
export function attachVenueWebsites(store: PipelineStore, venues: Map<string, Entity>, observations: Observation[], osm: OsmCinema[] = []): Map<string, Entity> {
  const enriched = new Map<string, Entity>();
  for (const entity of new Map([...venues.values()].map(venue => [venue.id, venue])).values()) {
    if (store.overrides(`entity:${entity.id}`).some(override => override.action === 'patch'
      && Object.hasOwn(override.patch?.fields ?? {}, 'websiteUrl'))) continue;
    const candidates = observations.filter(item => venues.get(item.subject)?.id === entity.id).flatMap(item => {
      const evidence = item.data.websiteEvidence;
      const verifiedSourceAddress = entity.data.locationEvidence?.identityEstablished === true
        && venueAddressesMatch(evidence?.address || '', entity.data.locationEvidence.sourceAddress || '');
      if (evidence?.source !== item.source || evidence.sourceUrl !== item.data.url
        || normalize(evidence.name || '') !== normalize(item.data.name)
        || !Number.isFinite(Date.parse(evidence.fetchedAt))
        || Date.parse(evidence.fetchedAt) < Date.parse(entity.data.websiteEvidence?.fetchedAt)
        || !(venueAddressesMatch(evidence.address || '', entity.data.address || '') || verifiedSourceAddress)) return [];
      try {
        const url = new URL(item.data.websiteUrl);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password ? [{ url: url.href, evidence, observationId: item.id }] : [];
      } catch { return []; }
    });
    if (!candidates.length) for (const place of osm) {
      const labels = [entity.name, ...(entity.data.aliases ?? []),
        ...observations.filter(item => venues.get(item.subject)?.id === entity.id).map(item => item.data.name)].map(normalize);
      const samePlace = !!place.id && place.id === entity.data.osmId;
      if (!samePlace && (!place.insideBerlin || !parseVenueAddress(place.address || '')?.postalCode
        || !venueAddressesMatch(place.address || '', entity.data.address || '')
        || ![place.name, ...(place.aliases ?? [])].some(name => labels.includes(normalize(name))))) continue;
      try {
        const url = new URL(place.website || '');
        if (/^https?:$/.test(url.protocol) && !url.username && !url.password) candidates.push({ url: url.href, observationId: null as any,
          evidence: { source: 'OpenStreetMap', sourceUrl: `https://www.openstreetmap.org/${place.id}`,
            name: place.name, address: place.address, fetchedAt: store.resource('osm:berlin')?.fetchedAt } });
      } catch { /* Missing or malformed provider URLs are not website candidates. */ }
    }
    if (!candidates.length) continue;
    const resolution = selectEvidence(candidates.map(candidate => ({ field: 'websiteUrl', value: candidate.url,
      source: candidate.evidence.source, observationId: candidate.observationId, observedAt: candidate.evidence.fetchedAt || '',
      selectedAt: candidate.evidence.fetchedAt || '', identityVerified: false, evidenceRole: 'venue-website',
      reason: 'Exact linked venue name/address website evidence' } as FieldValue)));
    const chosen = resolution.selected.get('websiteUrl');
    const updated = { ...entity, data: { ...entity.data, websiteUrl: chosen?.value,
      websiteEvidence: chosen ? candidates.find(candidate => candidate.url === chosen.value)!.evidence : undefined,
      websiteResolution: resolution.fields[0] } };
    store.saveEntity(updated); enriched.set(entity.id, updated);
  }
  return new Map([...venues].map(([subject, entity]) => [subject, enriched.get(entity.id) ?? entity]));
}
