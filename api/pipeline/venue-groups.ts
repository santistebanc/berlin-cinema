import { Entity, normalize } from './domain';
import { parseVenueAddress, venueAddressesMatch } from './addresses';
import { PipelineStore } from './store';
import { geoNameMatches } from './geocoding';

const descriptors = new Set(['kino', 'kinos', 'cinema', 'filmtheater', 'filmpalast', 'lichtspiele', 'kinowelt', 'berlin', 'in', 'der', 'die', 'das', 'am', 'im', 'an', 'den', 'dem']);
const brands = new Set(['uci', 'cinestar', 'cineplex', 'cinemaxx', 'luxe']);
export function compatibleVenueLabels(a: string, b: string): boolean {
  const tokens = (name: string) => new Set(normalize(name).split(' ').filter(token => token && !descriptors.has(token)));
  const left = tokens(a); const right = tokens(b);
  if (!left.size || !right.size) return false;
  if (left.size === right.size && [...left].every(token => right.has(token))) return true;
  const shorter = left.size < right.size ? left : right; const longer = left.size < right.size ? right : left;
  return [...shorter].every(token => longer.has(token)) && [...shorter].some(token => token.length >= 3 && !brands.has(token));
}

/** Verified buildings corroborate addresses, never cinema identity by themselves. */
export function consolidateVenues(store: PipelineStore, venues: Map<string, Entity>, now = new Date().toISOString()): Map<string, Entity> {
  const entities = [...new Map([...venues.values()].map(entity => [entity.id, entity])).values()].sort((a, b) => a.id.localeCompare(b.id));
  const providerPlaces = [...new Map(store.resources('geoapify:venue:')
    .filter(resource => Date.parse(now) - Date.parse(resource.fetchedAt) <= 90 * 86400000)
    .flatMap(resource => resource.data.candidates ?? []).filter(candidate => candidate.category === 'entertainment.cinema'
      && candidate.insideBerlin === true && candidate.boundary?.isoCode === 'DE-BE').map(candidate => [candidate.placeId, candidate])).values()] as any[];
  const validatedPlaces = new Map(entities.map(entity => {
    const matches = providerPlaces.filter(place => venueAddressesMatch(entity.data.address, place.address)
      && geoNameMatches(entity.name, place.raw ?? { name: place.name, other_names: { alt_name: place.aliases?.join(';') } }, true));
    return [entity.id, matches.length === 1 ? matches[0].placeId : null];
  }));
  const protectedIds = new Set(entities.filter(entity => store.overrides(`entity:${entity.id}`).length
    || store.linkedObservations(entity.id).some(observation => store.overrides(observation.subject).length)).map(entity => entity.id));
  const compatible = (a: Entity, b: Entity) => {
    if (protectedIds.has(a.id) || protectedIds.has(b.id) || !a.data.insideBerlin || !b.data.insideBerlin) return false;
    const left = parseVenueAddress(a.data.address); const right = parseVenueAddress(b.data.address);
    if (!left?.postalCode || !left.city || !right?.postalCode || !right.city) return false;
    if (a.data.osmId && b.data.osmId && a.data.osmId !== b.data.osmId) return false;
    const labelsMatch = [a.name, ...(a.data.aliases ?? [])].some(label => [b.name, ...(b.data.aliases ?? [])].some(other => compatibleVenueLabels(label, other)));
    const establishedA = a.data.locationEvidence?.identityEstablished === true && !!a.data.geoapifyPlaceId;
    const establishedB = b.data.locationEvidence?.identityEstablished === true && !!b.data.geoapifyPlaceId;
    if (establishedA && establishedB && a.data.geoapifyPlaceId && b.data.geoapifyPlaceId && a.data.geoapifyPlaceId !== b.data.geoapifyPlaceId) return false;
    if (!venueAddressesMatch(a.data.address, b.data.address)) {
      // A cinema POI may use 131 while its building spans 131–133. Compare exact
      // retained source addresses, never overlap or proximity of house numbers.
      const sourceA = a.data.locationEvidence?.sourceAddress; const sourceB = b.data.locationEvidence?.sourceAddress;
      const fullA = parseVenueAddress(sourceA); const fullB = parseVenueAddress(sourceB);
      return !!fullA?.postalCode && !!fullA.city && !!fullB?.postalCode && !!fullB.city && labelsMatch
        && (establishedA || establishedB) && a.data.locationEvidence?.boundary?.isoCode === 'DE-BE'
        && b.data.locationEvidence?.boundary?.isoCode === 'DE-BE' && venueAddressesMatch(sourceA, sourceB);
    }
    const leftPlace = validatedPlaces.get(a.id); const rightPlace = validatedPlaces.get(b.id);
    if (leftPlace && rightPlace) return leftPlace === rightPlace;
    const sameOsm = a.data.osmId && a.data.osmId === b.data.osmId;
    const sameGeo = a.data.geoapifyPlaceId && a.data.geoapifyPlaceId === b.data.geoapifyPlaceId;
    if (!sameOsm && !sameGeo) return false;
    if (sameOsm || sameGeo && a.data.locationEvidence?.identityEstablished === true && b.data.locationEvidence?.identityEstablished === true) return true;
    const verifiedAddress = (entity: Entity) => entity.data.locationEvidence?.boundary?.isoCode === 'DE-BE'
      && venueAddressesMatch(entity.data.address, entity.data.locationEvidence.matchedAddress || '');
    return verifiedAddress(a) && verifiedAddress(b) && labelsMatch;
  };
  const matches = entities.map((a, i) => entities.map((b, j) => i === j || compatible(a, b)));
  const canonical = new Map<string, Entity>(); const visited = new Set<number>();
  for (let start = 0; start < entities.length; start++) {
    if (visited.has(start)) continue;
    const component = [start]; visited.add(start);
    for (let cursor = 0; cursor < component.length; cursor++) for (let next = 0; next < entities.length; next++) {
      if (!visited.has(next) && matches[component[cursor]][next]) { visited.add(next); component.push(next); }
    }
    if (!component.every(i => component.every(j => matches[i][j]))) {
      for (const index of component) canonical.set(entities[index].id, entities[index]);
      continue;
    }
    const group = component.map(index => entities[index]);
    const primary = group.find(entity => entity.data.osmId || entity.data.locationEvidence?.identityEstablished === true) ?? group[0];
    const entity = group.length === 1 ? primary : { ...primary, data: { ...primary.data,
      aliases: [...new Set(group.flatMap(member => [member.name, ...(member.data.aliases ?? [])]))],
      consolidationEvidence: { sourceEntityIds: group.map(member => member.id),
        providerPlaceId: group.every(member => validatedPlaces.get(member.id) && validatedPlaces.get(member.id) === validatedPlaces.get(primary.id))
          ? validatedPlaces.get(primary.id) : null,
        reason: 'Exact verified full address plus compatible whole-word venue labels or independently validated shared cinema POI identity.' } } };
    if (group.length > 1) store.saveEntity(entity);
    for (const member of group) canonical.set(member.id, entity);
  }
  return new Map([...venues].map(([subject, entity]) => [subject, canonical.get(entity.id)!]));
}
