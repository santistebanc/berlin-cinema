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
  const malformed = await reload(async () => ({ ...valid, movies: [null] }), initial.snapshot, NOW);
  assert.match(malformed.error, /Invalid public snapshot/);
  assert.equal(malformed.snapshot.movies[0].slug, 'a-film', 'Malformed reloads retain eligible previous data');
  const failed = await reload(async () => { throw new Error('Offline'); }, initial.snapshot, new Date('2026-10-16T10:01:00Z'));
  assert.match(failed.error, /Offline/);
  assert.equal(failed.snapshot.movies.length, 0, 'A failed reload cannot extend old screening freshness');
  const confirmedEmpty = await reload(async () => empty, initial.snapshot, NOW);
  assert.equal(confirmedEmpty.error, null, 'A valid empty programme is successful data');
  assert.equal(confirmedEmpty.snapshot.movies.length, 0);
  console.log('public movie data acceptance tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
