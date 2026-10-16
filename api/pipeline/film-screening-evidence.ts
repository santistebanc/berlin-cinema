import { Entity, normalize } from './domain';
import { parseLabel } from './labels';

export interface FilmScreening {
  filmId: string; source: string; venueId: string; date: string; time: string;
  title: string; auditorium?: string | null;
}
export interface FilmScreeningMatch {
  left: string; right: string; leftIds: string[]; rightIds: string[]; sources: string[];
  rule: 'full-title-and-screening' | 'distinctive-screening-pattern';
  shared: { venueId: string; date: string; time: string }[];
  distinctive: number; coverage: number;
}

/** Compare original source schedules using resolved venues, before viewing deduplication. */
export function filmScreeningMatches(groups: Map<string, Entity[]>, rows: FilmScreening[]): FilmScreeningMatch[] {
  const groupFor = new Map([...groups].flatMap(([key, entities]) => entities.map(entity => [entity.id, key] as const)));
  const profiles = new Map<string, { group: string; source: string; titles: Set<string>; slots: Map<string, Set<string>> }>();
  const occupancy = new Map<string, Set<string>>();
  const addOccupant = (key: string, group: string) => {
    const values = occupancy.get(key) ?? new Set<string>(); values.add(group); occupancy.set(key, values);
  };
  for (const row of rows) {
    const group = groupFor.get(row.filmId); if (!group) continue;
    const key = JSON.stringify([group, row.source]);
    const profile = profiles.get(key) ?? { group, source: row.source, titles: new Set<string>(), slots: new Map<string, Set<string>>() };
    const title = normalize(parseLabel(row.title).title); if (title) profile.titles.add(title);
    const slot = JSON.stringify([row.venueId, row.date, row.time]);
    const rooms = profile.slots.get(slot) ?? new Set<string>();
    const room = normalize(row.auditorium || '').replace(/^(?:saal|kino|screen|auditorium|hall)\s*(?=\d)/, '');
    if (room) rooms.add(room);
    profile.slots.set(slot, rooms); profiles.set(key, profile);
    addOccupant(JSON.stringify([row.source, slot]), group);
    if (room) addOccupant(JSON.stringify([row.source, slot, room]), group);
  }
  const values = [...profiles.values()]; const matches: FilmScreeningMatch[] = [];
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    const a = values[i]; const b = values[j];
    const left = groups.get(a.group)!; const right = groups.get(b.group)!;
    const bothFilms = left.every(entity => entity.kind === 'film') && right.every(entity => entity.kind === 'film');
    const bothProgrammes = left.every(entity => entity.kind === 'programme') && right.every(entity => entity.kind === 'programme');
    // Films need independent sources. Programmes may also consolidate when one source
    // republishes the same timetable under multiple listing URLs.
    if ((!bothFilms && !bothProgrammes) || (a.source === b.source && !bothProgrammes)) continue;
    const shared = [...a.slots.keys()].filter(slot => b.slots.has(slot)); if (!shared.length) continue;
    const fullTitle = [...a.titles].some(title => b.titles.has(title));
    let conflict = false; const distinctiveSlots: string[] = [];
    for (const slot of shared) {
      const leftRooms = a.slots.get(slot)!; const rightRooms = b.slots.get(slot)!;
      const commonRooms = [...leftRooms].filter(room => rightRooms.has(room));
      if (leftRooms.size && rightRooms.size && !commonRooms.length) { conflict = true; break; }
      const uniqueSlot = [a, b].every(profile => occupancy.get(JSON.stringify([profile.source, slot]))?.size === 1);
      const uniqueRoom = commonRooms.some(room => [a, b].every(profile => occupancy.get(JSON.stringify([profile.source, slot, room]))?.size === 1));
      if (uniqueSlot || uniqueRoom) distinctiveSlots.push(slot);
    }
    if (conflict && !fullTitle) continue;
    const coverage = shared.length / Math.min(a.slots.size, b.slots.size);
    const dates = new Set(distinctiveSlots.map(slot => JSON.parse(slot)[1]));
    const venues = new Set(distinctiveSlots.map(slot => JSON.parse(slot)[0]));
    const highMatch = distinctiveSlots.length >= 3 && coverage >= 0.9 && (dates.size >= 2 || venues.size >= 2);
    if (bothProgrammes) {
      // Titles are not identity across sources. Exact shared cinema/date/time evidence is:
      // the smaller timetable is essentially contained via exclusive slots, or one source
      // republished the same parsed title under multiple listing URLs at shared slots.
      const sameSourceRepublish = a.source === b.source && shared.length > 0 && fullTitle;
      const scheduleProof = coverage >= 0.9 && (distinctiveSlots.length > 0 || sameSourceRepublish);
      if (!scheduleProof) continue;
      matches.push({ left: a.group, right: b.group, leftIds: left.map(entity => entity.id),
        rightIds: right.map(entity => entity.id), sources: [a.source, b.source],
        // Same-source republishes run in the early distinctive pass so a later cross-source
        // pass can treat the consolidated slot as exclusive.
        rule: !fullTitle || sameSourceRepublish || highMatch ? 'distinctive-screening-pattern' : 'full-title-and-screening',
        coverage, distinctive: distinctiveSlots.length,
        shared: shared.map(slot => { const [venueId, date, time] = JSON.parse(slot); return { venueId, date, time }; }) });
      continue;
    } else if (!fullTitle && !highMatch) continue;
    matches.push({ left: a.group, right: b.group, leftIds: left.map(entity => entity.id),
      rightIds: right.map(entity => entity.id), sources: [a.source, b.source],
      rule: highMatch ? 'distinctive-screening-pattern' : 'full-title-and-screening',
      coverage, distinctive: distinctiveSlots.length,
      shared: shared.map(slot => { const [venueId, date, time] = JSON.parse(slot); return { venueId, date, time }; }) });
  }
  return matches;
}
