import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildAudit, ensureAuditRunIndex, recordAudit, recordAuditFailure, recordImportedAudit, sanitizeAudit, AuditSnapshot } from './audit-log';
import type { Movie } from '../src/types';
import { latestChanges, fieldHistory, recordEvents } from '../src/utils/auditHistory';
import { versionTagCatalog } from '../src/utils/versionTags';
import { emptyModality, parseMarkers } from '../src/utils/screeningLabels';

const t1 = '2026-10-15T10:00:00Z', t2 = '2026-10-15T16:00:00Z';
function snapshot(at: string, overrides: Partial<Movie> = {}): AuditSnapshot {
  const movie = {
    title: 'A Film', slug: 'a-film', year: 2026, url: 'https://www.critic.de/movie/film/',
    variants: ['OV'], cinemas: [{ name: 'Odeon', address: 'A street', websiteUrl: 'https://cinema.example/' }],
    showings: { '2026-10-16': { '20:00': [{ cinema: 'Odeon', variants: ['OV'] }] } },
    sourceTitles: ['A Film'], posterUrl: null, ...overrides,
  } as unknown as Movie;
  return {
    movies: [movie], recordedAt: at, snapshotAt: at, mode: 'scrape', inputs: [{ name: 'critic.de', status: 'fresh', observedAt: at,
      movies: [{ ...movie, cinemas: movie.cinemas.map(c => ({ ...c })), showings: [{ date: '2026-10-16', time: '20:00', cinema: 'Odeon', variant: 'OV' }] }],
    }],
  };
}

const first = buildAudit(null, snapshot(t1));
assert.equal(first.run.changes.baseline, 3);
assert.equal(first.run.changes.added, 0, 'A baseline must not claim old records were just created');
const movieId = Object.values(first.index.entities).find(e => e.kind === 'movie')!.id;
const screeningId = Object.values(first.index.entities).find(e => e.kind === 'screening')!.id;
const unchanged = buildAudit(first.index, snapshot(t2));
assert.equal(unchanged.run.changes.modified, 0, 'Seeing identical data again is not a content update');
assert.equal(unchanged.index.entities[movieId].lastSeenAt, t2);
assert.equal(unchanged.index.entities[movieId].lastChangedAt, null, 'The true change date of a baseline record is unknown');
assert.equal(unchanged.index.entities[movieId].firstSeenAt, t1);

const enriched = buildAudit(unchanged.index, snapshot('2026-10-15T17:00:00Z', { imdbId: 'tt1234567', plot: 'A new plot' }));
assert.equal(enriched.index.entities[movieId].data.imdbId, 'tt1234567', 'Enrichment must not replace a record identity');
assert.equal(enriched.run.changes.added, 0);
assert.ok(enriched.run.changesList.find(c => c.entityId === movieId)?.fields.plot);
assert.ok(enriched.index.entities[screeningId].listed);
assert.deepEqual(latestChanges(first.run), [], 'Baseline records are not latest-run changes');
assert.deepEqual(latestChanges(unchanged.run), [], 'A no-change run has no rows');
assert.equal(latestChanges(enriched.run).length, enriched.run.changesList.length);
const history = fieldHistory([first.run, enriched.run, unchanged.run], movieId, 'plot');
assert.equal(history.length, 1);
assert.equal(history[0].after, 'A new plot');
assert.equal(history[0].at, enriched.run.recordedAt);
assert.equal(recordEvents([first.run, enriched.run], movieId)[0].runId, enriched.run.id);
assert.deepEqual(unchanged.index.recordRuns[movieId], [first.run.id], 'An unchanged sighting needs no value-history report');
assert.deepEqual(enriched.index.recordRuns[movieId], [first.run.id, enriched.run.id]);
assert.equal(fieldHistory([first.run], movieId, 'source.critic.de')[0].change.action, 'baseline', 'Retain the initial extracted values as well as resolved values');
const evidenceInput = snapshot(t2);
evidenceInput.decisions = [{ entity: 'movie', subject: 'A Film', provider: 'TMDb', action: 'cache-reused', details: {} }];
const evidenceRun = buildAudit(first.index, evidenceInput);
assert.ok(evidenceRun.index.recordRuns[movieId].includes(evidenceRun.run.id), 'Unchanged records can still have new API evidence');
const replacement = buildAudit(enriched.index, snapshot('2026-10-15T17:30:00Z', { imdbId: 'tt9999999' }));
assert.equal(replacement.index.entities[movieId].listed, false, 'A changed external identity must not silently rewrite another film history');
assert.equal(replacement.run.changes.added, 2, 'A different movie and its viewing get their own identities');

const changed = snapshot('2026-10-15T18:00:00Z');
changed.movies[0].showings['2026-10-16']['20:00'][0].variants = ['OmU'];
changed.inputs[0].movies[0].showings[0].variant = 'OmU';
const formatChange = buildAudit(first.index, changed);
assert.equal(formatChange.run.changes.added, 0);
assert.ok(formatChange.run.changesList.find(c => c.entityId === screeningId)?.fields.variants);

const aliasSnapshot = snapshot(t2);
aliasSnapshot.inputs[0].movies[0].showings[0].variant = 'OF';
aliasSnapshot.inputs.push({ ...aliasSnapshot.inputs[0], name: 'berlin.de', movies: [{ ...aliasSnapshot.inputs[0].movies[0],
  showings: [{ date: '2026-10-16', time: '20:00', cinema: 'Odeon', variant: 'OV' }] }] });
const aliasCatalog = versionTagCatalog(Object.values(buildAudit(null, aliasSnapshot).index.entities));
assert.equal(aliasCatalog.length, 1, 'Equivalent raw labels produce one canonical tag');
assert.equal(aliasCatalog[0].label, 'OV'); assert.equal(aliasCatalog[0].confirmed.length, 1, 'Multiple sources do not double-count a viewing');
assert.deepEqual(aliasCatalog[0].labels, ['OF', 'OV']);
assert.deepEqual(aliasCatalog[0].sources, ['berlin.de', 'critic.de']);

const preciseSnapshot = snapshot(t2, { originalLanguage: 'de' });
preciseSnapshot.movies[0].showings['2026-10-16']['20:00'][0].variants = ['OmeU', 'MXP 2D'];
preciseSnapshot.inputs[0].movies[0].showings[0].variant = 'MXP 2D OmenglU';
const preciseCatalog = versionTagCatalog(Object.values(buildAudit(null, preciseSnapshot).index.entities));
assert.equal(preciseCatalog.find(tag => tag.label === 'OmeU')!.confirmed.length, 1);
assert.ok(preciseCatalog.find(tag => tag.label === 'OmeU')!.labels.includes('MXP 2D OmenglU'));
assert.equal(preciseCatalog.find(tag => tag.label === 'MXP 2D')!.category, 'Projection', 'Formats and language markers remain separate dimensions');
assert.equal(preciseCatalog.length, 2);

const genericSubtitles = snapshot(t2, { originalLanguage: 'de' });
genericSubtitles.movies[0].showings['2026-10-16']['20:00'][0].variants = ['OmU'];
genericSubtitles.inputs[0].movies[0].showings[0].variant = 'OmU';
const genericCatalog = versionTagCatalog(Object.values(buildAudit(null, genericSubtitles).index.entities));
assert.ok(genericCatalog.some(tag => tag.label === 'OmU')); assert.ok(!genericCatalog.some(tag => tag.label === 'OmeU'), 'Original film language cannot imply English subtitles');
assert.ok(Object.values(buildAudit(null, genericSubtitles).index.entities).find(record => record.kind === 'screening')!.sources['critic.de'], 'Keep raw OmU source evidence without inferring English subtitles');

const conflictingSnapshot = snapshot(t2);
conflictingSnapshot.movies[0].showings['2026-10-16']['20:00'][0] = { cinema: 'Odeon', variants: [],
  modality: emptyModality(), alternatives: [parseMarkers('DFmEnglU')!, parseMarkers('OmU')!] };
conflictingSnapshot.inputs[0].movies[0].showings[0].variant = 'DFmEnglU';
const conflictingCatalog = versionTagCatalog(Object.values(buildAudit(null, conflictingSnapshot).index.entities));
assert.equal(conflictingCatalog.find(tag => tag.label === 'Unspecified')!.confirmed.length, 1);
assert.equal(conflictingCatalog.find(tag => tag.label === 'DFmEnglU')!.confirmed.length, 0);
assert.equal(conflictingCatalog.find(tag => tag.label === 'DFmEnglU')!.sourceOnly.length, 1);
assert.equal(conflictingCatalog.find(tag => tag.label === 'OmU')!.confirmed.length, 0, 'Alternative descriptions are not published facts');

const unknownSnapshot = snapshot(t2);
unknownSnapshot.inputs[0].movies[0].showings[0].variant = 'SuperOV';
const unknownCatalog = versionTagCatalog(Object.values(buildAudit(null, unknownSnapshot).index.entities));
assert.equal(unknownCatalog.find(tag => tag.label === 'SuperOV')!.category, 'Unrecognized', 'An embedded substring never establishes tag equivalence');
assert.equal(parseMarkers('OV DF'), null, 'A contradictory composite marker must not select the last known language');
assert.equal(parseMarkers('2D 3D'), null, 'A contradictory composite format remains unrecognized');
assert.equal(parseMarkers('Extended Version')!.edition, parseMarkers('Extended cut')!.edition, 'Equivalent edition spellings share the same canonical edition');
assert.equal(parseMarkers("Director’s Cut")!.edition, parseMarkers("Director's Cut")!.edition);
const legacyConflict = snapshot(t2);
legacyConflict.movies[0].showings['2026-10-16']['20:00'][0].variants = ['OV', 'DF'];
const legacyTags = versionTagCatalog(Object.values(buildAudit(null, legacyConflict).index.entities));
assert.equal(legacyTags.find(tag => tag.label === 'OV')!.confirmed.length, 0, 'Older mixed variant arrays cannot promote contradictory tags to confirmed facts');
assert.equal(legacyTags.find(tag => tag.label === 'DF')!.sourceOnly.length, 1);

const cachedSnapshot = snapshot(t2);
cachedSnapshot.inputs[0].status = 'cached'; cachedSnapshot.inputs[0].observedAt = t1;
const cached = buildAudit(first.index, cachedSnapshot);
assert.equal(cached.index.entities[movieId].lastSeenAt, t1, 'Cached extraction must not advance source freshness');

const missing = buildAudit(first.index, { ...snapshot(t2), movies: [] });
assert.equal(missing.run.changes['no-longer-listed'], 3);
assert.equal(missing.index.entities[movieId].listed, false);
assert.equal(missing.index.entities[movieId].lastSeenAt, t1);
const returned = buildAudit(missing.index, snapshot('2026-10-15T19:00:00Z'));
assert.equal(returned.run.changes.returned, 3);
assert.equal(returned.index.entities[movieId].firstSeenAt, t1);

const separateSources = snapshot(t2);
separateSources.inputs.push({ ...separateSources.inputs[0], name: 'berlin.de', observedAt: t1 });
const provenance = buildAudit(null, separateSources).index.entities;
assert.deepEqual(provenance[movieId].firstSources, ['berlin.de']);
assert.deepEqual(provenance[movieId].lastSources, ['critic.de']);
assert.equal(Object.keys(provenance[movieId].sources).length, 2);

const publicData = JSON.stringify(sanitizeAudit({ api_key: 'sensitive-value', TMDB_API_KEY: 'sensitive-value', client_secret: 'sensitive-value', url: 'https://user:pass@example.com/?apikey=sensitive-value',
  nested: { Authorization: 'Bearer sensitive-value', text: 'failure?token=sensitive-value' } }));
assert.ok(!publicData.includes('sensitive-value') && !publicData.includes('user:pass'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-audit-'));
try {
  const run = recordAudit(snapshot(t1), directory);
  assert.ok(fs.existsSync(path.join(directory, 'runs', `${run.id}.json`)));
  recordAudit(snapshot(t2), directory);
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf-8'));
  assert.equal(index.runs.length, 2);
  assert.equal(index.entities[movieId].firstSeenAt, t1);
  const originalReport = fs.readFileSync(path.join(directory, 'runs', `${run.id}.json`), 'utf-8');
  delete index.recordRuns;
  fs.writeFileSync(path.join(directory, 'index.json'), JSON.stringify(index));
  ensureAuditRunIndex(directory);
  const upgraded = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf-8'));
  assert.deepEqual(upgraded.recordRuns[movieId], [run.id]);
  assert.equal(upgraded.runs.length, index.runs.length, 'Index upgrades must not create fake runs');
  assert.equal(fs.readFileSync(path.join(directory, 'runs', `${run.id}.json`), 'utf-8'), originalReport, 'Index upgrades must preserve immutable reports');
  recordAuditFailure([{ name: 'critic.de', status: 'failed' }], 'Request failed', directory);
  const failedIndex = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf-8'));
  assert.equal(failedIndex.runs[0].status, 'failed');
  assert.deepEqual(failedIndex.entities, index.entities, 'Failed refreshes must not change entity history');
  const failure = JSON.parse(fs.readFileSync(path.join(directory, 'runs', `${failedIndex.latestRunId}.json`), 'utf-8'));
  assert.equal(failure.changesList.length, 0);
  const imported = { movies: snapshot(t2).movies, scrapedAt: t2 };
  recordImportedAudit(imported, directory);
  recordImportedAudit(imported, directory);
  const importIndex = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf-8'));
  assert.equal(importIndex.runs.length, 4, 'Repeated imports of an unchanged snapshot must not invent refreshes');
} finally {
  for (const file of fs.readdirSync(path.join(directory, 'runs'))) fs.unlinkSync(path.join(directory, 'runs', file));
  fs.rmdirSync(path.join(directory, 'runs')); fs.unlinkSync(path.join(directory, 'index.json')); fs.rmdirSync(directory);
}
console.log('audit-log tests passed');
