import assert from 'assert/strict';
import { currentSnapshot } from '../utils/liveSnapshot';
import * as movieData from './movie-data';

const NOW = new Date('2026-10-15T10:00:00Z');
const empty = { schemaVersion: 2, movies: [], total: 0, scrapedAt: NOW.toISOString() };

async function main() {
  assert.deepEqual(currentSnapshot(empty as any, NOW).movies, []);
  assert.throws(() => currentSnapshot({ ...empty, movies: [{}] } as any, NOW), /Invalid public snapshot.*movies/i,
    'A schema error must explain the invalid field before freshness processing');
  assert.throws(() => currentSnapshot({ ...empty, schemaVersion: 99 } as any, NOW), /Invalid public snapshot/i);
  assert.throws(() => currentSnapshot({ ...empty, scrapedAt: 'yesterday' } as any, NOW), /Invalid public snapshot/i);
  const reload = (movieData as any).loadMovieData;
  const valid = { ...empty, total: 1, movies: [{ title: 'A Film', slug: 'a-film', variants: ['OV'], cinemas: [],
    showings: { '2026-10-16': { '20:00': [{ cinema: 'Example Cinema', variants: ['OV'], lastObservedAt: NOW.toISOString() }] } } }] };
  const initial = await reload(async () => valid, null, NOW);
  assert.equal(initial.error, null);
  assert.equal(initial.snapshot.movies.length, 1);
  assert.equal(initial.dataState, 'ready');
  assert.equal(initial.loadState, 'loaded');
  const malformed = await reload(async () => ({ ...valid, movies: [null] }), initial.snapshot, NOW);
  assert.match(malformed.error, /Invalid public snapshot/);
  assert.equal(malformed.snapshot.movies[0].slug, 'a-film', 'Malformed reloads retain eligible previous data');
  assert.equal(malformed.loadState, 'schema-failed');
  const contradictory = await reload(async () => ({ ...empty, programmeStatus: 'available' }), initial.snapshot, NOW);
  assert.equal(contradictory.loadState, 'schema-failed', 'A contradictory programme status is malformed data, not a confirmed empty programme');
  assert.equal(contradictory.snapshot.movies[0].slug, 'a-film');
  const failed = await reload(async () => { throw new Error('Offline'); }, initial.snapshot, new Date('2026-10-16T10:01:00Z'));
  assert.match(failed.error, /Offline/);
  assert.equal(failed.snapshot.movies.length, 0, 'A failed reload cannot extend old screening freshness');
  assert.equal(failed.dataState, 'expired');
  assert.equal(failed.loadState, 'transport-failed');
  const confirmedEmpty = await reload(async () => empty, initial.snapshot, NOW);
  assert.equal(confirmedEmpty.error, null, 'A valid empty programme is successful data');
  assert.equal(confirmedEmpty.snapshot.movies.length, 0);
  assert.equal(confirmedEmpty.dataState, 'empty');
  const legacy = { ...valid }; delete legacy.schemaVersion;
  const legacyExpired = await reload(async () => legacy, null, new Date('2026-10-16T10:00:01Z'));
  assert.equal(legacyExpired.dataState, 'expired', 'Retained legacy/PWA snapshots expire using their original timestamps');
  const boundary = { ...valid, scrapedAt: '2026-10-15T22:00:00Z', movies: [{ ...valid.movies[0],
    showings: { '2026-10-15': { '23:30': [{ cinema: 'Example Cinema', variants: ['OV'], lastObservedAt: '2026-10-15T22:00:00Z' }] },
      '2026-10-16': { '00:45': [{ cinema: 'Example Cinema', variants: ['OV'], lastObservedAt: '2026-10-15T22:00:00Z' }] } } }] };
  const midnight = await reload(async () => boundary, null, new Date('2026-10-15T22:30:00Z'));
  assert.deepEqual(Object.keys(midnight.snapshot.movies[0].showings), ['2026-10-16'], 'Showing date boundaries use Europe/Berlin rather than UTC');
  const eligibleFallback = await reload(async () => { throw new Error('Temporary failure'); }, initial.snapshot, NOW);
  assert.equal(eligibleFallback.dataState, 'ready');
  assert.equal(eligibleFallback.snapshot.movies[0].showings['2026-10-16']['20:00'][0].lastObservedAt, NOW.toISOString());
  const noFallback = await reload(async () => { throw new Error('Offline'); }, null, NOW);
  assert.equal(noFallback.dataState, 'unavailable');
  const staleEmpty = await reload(async () => empty, null, new Date('2026-10-16T10:00:01Z'));
  assert.equal(staleEmpty.dataState, 'expired', 'A cached old empty programme cannot claim current completeness forever');
  console.log('public movie data acceptance tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
