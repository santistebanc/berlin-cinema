import { Entity, normalize } from './domain';
import { supportsFilmIdentity } from './identity-evidence';
import { identityConflict } from './resolve';
import { PipelineStore } from './store';
import { parseLabel } from './labels';
import { FilmScreening, filmScreeningMatches } from './film-screening-evidence';
import { independentObservations } from './lineage';

/** Reconcile established source links for publication without destroying their separate evidence or corrections. */
export function filmDisplayGroups(store: PipelineStore, entities: Entity[], screenings: FilmScreening[] = []): Map<string, Entity[]> {
  const separated = new Set(entities.filter(entity => store.linkedObservations(entity.id)
    .some(observation => store.overrides(observation.subject).some(correction => correction.action === 'separate'))).map(entity => entity.id));
  const base = new Map<string, Entity[]>();
  for (const entity of entities) {
    const key = entity.data.tmdbId && !separated.has(entity.id) ? `tmdb:${entity.data.tmdbId}` : entity.id;
    base.set(key, [...(base.get(key) ?? []), entity]);
  }
  const activeSubjects = new Set(store.observations(undefined, true).filter(item => item.kind === 'listing').map(item => item.subject));
  const observations = new Map(entities.map(entity => [entity.id, store.linkedObservations(entity.id).filter(o => o.kind === 'listing' && activeSubjects.has(o.subject))]));
  const profiles = new Map(entities.map(entity => [entity.id, observations.get(entity.id)!.map(o => o.data)]));
  const titleKeys = (data: any) => [data.rawTitle || data.title, data.originalTitle, data.altTitle, data.displayTitle]
    .filter(Boolean).map(title => normalize(parseLabel(title).title)).filter(Boolean);
  const sourceTitles = new Map([...observations.values()].flat().map(item => [item.id, titleKeys(item.data)]));
  const compatible = (a: Entity, b: Entity) => {
    if (a.kind !== 'film' || b.kind !== 'film' || separated.has(a.id) || separated.has(b.id) || identityConflict(a.data, b.data)) return false;
    const left = profiles.get(a.id)!; const right = profiles.get(b.id)!;
    return left.length > 0 && right.length > 0
      && left.every(x => right.every(y => !identityConflict(x, y)));
  };
  const fullTitle = (a: Entity, b: Entity) => {
    const titles = new Set([a.name, ...(a.data.titles ?? [])].map(normalize));
    return [b.name, ...(b.data.titles ?? [])].some(title => titles.has(normalize(title)));
  };
  const strong = (a: Entity, b: Entity) => fullTitle(a, b)
    && observations.get(a.id)!.some(x => observations.get(b.id)!.some(y => independentObservations(x, y) && supportsFilmIdentity(x.data, y.data)));
  const distinguishingTitle = (entity: Entity) => {
    const title = normalize(parseLabel(entity.name).title);
    return JSON.stringify({ numbers: [...new Set(title.match(/\b\d+\b/g) ?? [])].sort(), liveAction: /\blive action\b/.test(title) });
  };
  const crossSourceTitle = (a: Entity, b: Entity) => fullTitle(a, b) && distinguishingTitle(a) === distinguishingTitle(b)
    && observations.get(a.id)!.some(x => observations.get(b.id)!.some(y => x.source !== y.source
      && sourceTitles.get(x.id)!.some(title => !/^(?:festival|film\s?festival|sonderprogramm)$/.test(title)
        && sourceTitles.get(y.id)!.includes(title))));
  const confirmedIdsConflict = (a: Entity, b: Entity) => !!(a.data.tmdbId && b.data.tmdbId && a.data.tmdbId !== b.data.tmdbId
    || a.data.verifiedImdbId && b.data.verifiedImdbId && a.data.verifiedImdbId !== b.data.verifiedImdbId);
  const scheduleCompatible = (a: Entity, b: Entity) => a.kind === b.kind && (a.kind === 'film' || a.kind === 'programme')
    && !separated.has(a.id) && !separated.has(b.id) && !confirmedIdsConflict(a, b);
  const schedules = (groups: Map<string, Entity[]>, repeatedOnly: boolean) => {
    const matches = filmScreeningMatches(groups, screenings).filter(match => !repeatedOnly || match.rule === 'distinctive-screening-pattern');
    return combineGroups(groups, scheduleCompatible, (a, b) => matches.some(match => match.leftIds.includes(a.id) && match.rightIds.includes(b.id)
      || match.rightIds.includes(a.id) && match.leftIds.includes(b.id)));
  };
  // Distinctive timetables take precedence over noisy source credits. Recheck
  // after credit-supported aliases collapse, since duplicate aliases can make
  // an otherwise distinctive multiplex slot appear ambiguous.
  const timetableFirst = schedules(base, true);
  const proven = combineGroups(timetableFirst, compatible, strong);
  const scheduled = schedules(schedules(proven, true), false);
  return combineGroups(scheduled, compatible, crossSourceTitle);
}

function combineGroups(groups: Map<string, Entity[]>, compatible: (a: Entity, b: Entity) => boolean,
  supported: (a: Entity, b: Entity) => boolean): Map<string, Entity[]> {
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const matches = entries.map(([key, group], i) => entries.map(([otherKey, other], j) => i === j ||
    group.every(a => other.every(b => compatible(a, b))) && group.some(a => other.some(b => supported(a, b)))));
  const output = new Map<string, Entity[]>(); const visited = new Set<number>();
  for (let start = 0; start < entries.length; start++) {
    if (visited.has(start)) continue;
    const component = [start]; visited.add(start);
    for (let cursor = 0; cursor < component.length; cursor++) for (let next = 0; next < entries.length; next++) {
      if (!visited.has(next) && matches[component[cursor]][next]) { visited.add(next); component.push(next); }
    }
    // Every candidate must agree with every other candidate. In particular, an
    // undated exact-title listing cannot bridge two remakes or choose between
    // several distinct records from the other source.
    if (!component.every(i => component.every(j => matches[i][j]))) {
      for (const index of component) output.set(entries[index][0], entries[index][1]);
      continue;
    }
    const key = component.map(index => entries[index][0]).find(key => key.startsWith('tmdb:')) ?? entries[start][0];
    output.set(key, component.flatMap(index => entries[index][1]));
  }
  return output;
}
