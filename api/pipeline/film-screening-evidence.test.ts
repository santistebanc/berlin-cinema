import assert from 'assert/strict';
import { Entity, fingerprint } from './domain';
import { observation } from './observations';
import { PipelineStore } from './store';
import { filmDisplayGroups } from './film-groups';
import { FilmScreening, filmScreeningMatches } from './film-screening-evidence';
import { enrichEntity } from './enrichment';
import { DecisionEngine } from './decision-model';
import { filmMetadataInput } from './identity-evidence';
import { linkEvidence } from './resolve';

const NOW = '2026-10-16T06:00:00Z';
const slots = [
  { venueId: 'cinema-1', date: '2026-10-17', time: '19:15' },
  { venueId: 'cinema-2', date: '2026-10-18', time: '20:35' },
  { venueId: 'cinema-1', date: '2026-10-19', time: '21:10' },
];
function fixture(titles = ['Original Film', 'An Incorrect Translation']) {
  const store = new PipelineStore(':memory:');
  const entities: Entity[] = titles.map((name, i) => ({ id: `film-${i}`, kind: 'film', name,
    data: { year: i ? 1980 : 2026, director: i ? 'Incorrect Source Credit' : 'Verified Director' } }));
  const listings = entities.map((entity, i) => observation(i ? 'b' : 'a', 'listing', entity.id,
    { rawTitle: entity.name, ...entity.data }, NOW));
  entities.forEach((entity, i) => { store.saveEntity(entity); store.observe(listings[i]);
    store.saveLink(listings[i].subject, entity.id, linkEvidence(listings[i]), 'provisional'); });
  const rows: FilmScreening[] = entities.flatMap((entity, i) => slots.map(slot => ({ ...slot,
    filmId: entity.id, source: i ? 'b' : 'a', title: entity.name })));
  return { store, entities, listings, rows };
}

async function main() {
  const repeated = fixture();
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities).size, 2);
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities, repeated.rows).size, 1,
    'Distinctive raw schedules outrank wrong source title, director and year');
  const proof = filmScreeningMatches(new Map(repeated.entities.map(entity => [entity.id, [entity]])), repeated.rows);
  assert.equal(proof[0].rule, 'distinctive-screening-pattern'); assert.equal(proof[0].coverage, 1);
  const priority = fixture(['Original Film', 'An Incorrect Translation', 'Original Film']);
  priority.entities[2].data = { ...priority.entities[0].data };
  const mistakenCredits = observation('b', 'listing', priority.entities[2].id,
    { rawTitle: 'Original Film', ...priority.entities[2].data }, NOW);
  priority.store.observe(mistakenCredits);
  priority.store.saveLink(mistakenCredits.subject, priority.entities[2].id, linkEvidence(mistakenCredits), 'provisional');
  const priorityRows = priority.rows.filter(row => row.filmId !== priority.entities[2].id);
  priorityRows.push({ ...priority.rows[6], venueId: 'different-cinema', time: '14:00' });
  const priorityGroups = [...filmDisplayGroups(priority.store, priority.entities, priorityRows).values()];
  assert.equal(priorityGroups.length, 2);
  assert(priorityGroups.some(group => group.length === 2 && group.some(entity => entity.id === 'film-0')
    && group.some(entity => entity.id === 'film-1')), 'The distinctive schedule wins before a conflicting source-title/credit match');

  const named = fixture(['Same Film (OV)', 'Same Film (OmU)']);
  assert.equal(filmDisplayGroups(named.store, named.entities, named.rows.filter(row => row.date === slots[0].date)).size, 1,
    'Same cinema/date/time and complete title identify one viewing despite credit/version mistakes');
  const fragment = fixture(['Queen Budapest', 'Jim Queen']);
  assert.equal(filmDisplayGroups(fragment.store, fragment.entities, fragment.rows.filter(row => row.date === slots[0].date)).size, 2,
    'A single coincident slot and a title fragment cannot establish identity');
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities, repeated.rows.filter(row => row.date !== slots[2].date)).size, 2);
  const duplicates = repeated.rows.filter(row => row.date === slots[0].date);
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities, [...duplicates, ...duplicates, ...duplicates]).size, 2,
    'Repeated copies of one source row are not several matching screenings');
  const poorCoverage = [...repeated.rows, ...repeated.rows.map(row => ({ ...row, time: row.source === 'a' ? '10:00' : '11:00' }))];
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities, poorCoverage).size, 2);
  const differentCinema = repeated.rows.map(row => row.source === 'b' ? { ...row, venueId: 'different-cinema' } : row);
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities, differentCinema).size, 2);

  const multiplex = fixture(['Original Film', 'Translated Film', 'Unrelated Film']);
  assert.equal(filmDisplayGroups(multiplex.store, multiplex.entities, multiplex.rows).size, 3,
    'Movies running simultaneously in different multiplex screens are ambiguous without room evidence');
  const rooms = multiplex.rows.map(row => ({ ...row, auditorium: row.filmId === 'film-2' ? 'Screen 2' : 'Saal 1' }));
  assert.equal(filmDisplayGroups(multiplex.store, multiplex.entities, rooms).size, 2,
    'A common explicit auditorium can distinguish the repeated schedule');
  const roomConflict = repeated.rows.map(row => ({ ...row, auditorium: row.source === 'a' ? 'Screen 1' : 'Screen 2' }));
  assert.equal(filmDisplayGroups(repeated.store, repeated.entities, roomConflict).size, 2);
  const ambiguousName = fixture(['Same Film', 'Same Film', 'Same Film']);
  ambiguousName.entities[2].data.year = 1990; ambiguousName.entities[2].data.director = 'Another Director';
  assert.equal(filmDisplayGroups(ambiguousName.store, ambiguousName.entities,
    ambiguousName.rows.filter(row => row.date === slots[0].date)).size, 3,
    'One matching source cannot choose between several independently conflicting same-title records');

  const external = fixture(); external.entities[0].data.tmdbId = 1; external.entities[1].data.tmdbId = 2;
  assert.equal(filmDisplayGroups(external.store, external.entities, external.rows).size, 2);
  const manual = fixture();
  manual.store.addOverride({ subject: manual.listings[1].subject, action: 'separate', targetId: manual.entities[0].id,
    evidenceFingerprint: linkEvidence(manual.listings[1]), actor: 'test', reason: 'Keep distinct' });
  assert.equal(filmDisplayGroups(manual.store, manual.entities, manual.rows).size, 2);
  const programme = fixture(); programme.entities[1].kind = 'programme';
  assert.equal(filmDisplayGroups(programme.store, programme.entities, programme.rows).size, 2);

  const { store, entities, listings } = repeated;
  const anchor = entities[0]; anchor.data.tmdbId = 123;
  anchor.data.metadataEvidence = fingerprint(filmMetadataInput(anchor));
  store.saveEntity(anchor);
  store.saveFields(anchor.id, [{ field: 'director', value: 'Verified Director', source: 'TMDb:123', observationId: null,
    observedAt: NOW, selectedAt: NOW, reason: 'Independently corroborated provider identity', identityVerified: true }]);
  store.saveResource('tmdb-enrichment:123', { releaseYear: 2026, director: 'Verified Director', cast: ['First Actor', 'Second Actor'],
    originalTitle: 'Original Film', imdbId: 'tt0000123' }, NOW);
  const result = await enrichEntity(store, new DecisionEngine(store, null), entities[1], [listings[1]], {
    now: NOW, tmdb: null, screeningPeer: { entityId: anchor.id, tmdbId: 123, matches: proof } });
  assert.equal(result.year, 2026); assert.equal(result.director, 'Verified Director');
  assert.equal(entities[1].data.metadataAnchorId, anchor.id);
  assert.equal(store.head(listings[1].subject)!.data.year, 1980, 'The erroneous source claim remains attributed');
  assert.equal(store.issues().some(issue => issue.status === 'open'), false);
  const third: Entity = { id: 'third', kind: 'film', name: 'Another Label', data: {} };
  store.saveEntity(third);
  await enrichEntity(store, new DecisionEngine(store, null), third, [], { now: NOW, tmdb: null,
    screeningPeer: { entityId: entities[1].id, tmdbId: 123, matches: proof } });
  assert.equal(third.data.tmdbId, undefined, 'An inherited identity cannot become independent evidence for another inference');
  await enrichEntity(store, new DecisionEngine(store, null), third, [], { now: NOW, tmdb: null,
    screeningPeer: { entityId: anchor.id, tmdbId: 123, matches: proof } });
  assert.equal(third.data.tmdbId, undefined, 'A different pair of listings does not supply schedule evidence for this record');
  store.issue({ type: 'metadata-match', subject: `metadata:${third.id}`, title: 'Resolve metadata: Another Label',
    status: 'open', priority: 85, fingerprint: 'previous-query', details: { entityId: third.id, candidates: [{ id: 456, title: 'A Candidate' }] } });
  third.data.titles = ['Another Label', 'New source alias'];
  await enrichEntity(store, new DecisionEngine(store, null), third, [], { now: NOW, tmdb: null });
  assert.equal(store.issues().find(issue => issue.subject === `metadata:${third.id}`)!.status, 'open',
    'A newly combined alias without an available API query must not silently close unresolved metadata');
  console.log('raw screening identity, ambiguity, metadata peer and correction tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
