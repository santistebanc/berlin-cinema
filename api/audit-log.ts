import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import type { Movie } from '../src/types';
import type { AuditChange, AuditDecision, AuditEntity, AuditIndex, AuditKind, AuditRun, AuditSource } from '../src/types/audit';
import { parseTitle } from './title-utils';

export interface AuditInput extends AuditSource { movies: any[] }
export interface AuditSnapshot {
  movies: Movie[];
  snapshotAt: string;
  recordedAt?: string;
  mode: AuditRun['mode'];
  inputs: AuditInput[];
  decisions?: AuditDecision[];
  cinemaAliases?: Record<string, string>;
  notes?: string[];
}

export function auditFingerprint(snapshot: AuditSnapshot): string {
  return hash(stable({ projectionVersion: 2, movies: snapshot.movies, inputs: snapshot.inputs.map(({ movies, ...source }) => source) }));
}

interface Observation { source: string; at: string; name: string; url: string | null; details: Record<string, any> }
interface Candidate { kind: AuditKind; label: string; keys: string[]; data: Record<string, any>; observations: Observation[]; movieId?: string; cinemaId?: string }
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
const movieIdentityKeys = (data: Record<string, any>): string[] => typeof data.id === 'string' && data.id ? [`movie-id:${data.id}`] : [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);
const dateIsValid = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const secretKey = /^(?:.*[_-])?(api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|password|secret|cookie|set-cookie)$/i;

/** Only explicitly constructed public data reaches this boundary; redact again defensively. */
export function sanitizeAudit(value: any): any {
  if (typeof value === 'string') {
    let result = value.replace(/((?:api[_-]?key|apikey|token|secret|password)=)[^\s&#]+/gi, '$1[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]');
    if (/^https?:\/\//i.test(result)) {
      try {
        const url = new URL(result);
        url.username = ''; url.password = '';
        for (const key of [...url.searchParams.keys()]) if (secretKey.test(key)) url.searchParams.set(key, '[REDACTED]');
        result = url.toString();
      } catch { /* Keep redacted non-URL strings. */ }
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(sanitizeAudit);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, secretKey.test(key) ? '[REDACTED]' : sanitizeAudit(item)]));
  return value ?? null;
}

function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function publicMovie(movie: any): Record<string, any> {
  const { showings, cinemas, sourceTitles, tmdbFetched, omdbFetchedAt, provenance, ...details } = movie;
  return sanitizeAudit(details);
}

function rawCinema(cinema: any): Record<string, any> {
  const { showtimes, ...details } = cinema;
  return sanitizeAudit(details);
}

function sourceObservation(input: AuditInput, name: string, url: string | null, details: any): Observation[] {
  // Failed/skipped sources are never treated as a fresh extraction.
  if (input.status === 'failed' || input.status === 'skipped' || !dateIsValid(input.observedAt)) return [];
  return [{ source: input.name, at: input.observedAt, name, url, details: sanitizeAudit(details) }];
}

export function buildAudit(previous: AuditIndex | null, snapshot: AuditSnapshot): { index: AuditIndex; run: AuditRun } {
  if (!dateIsValid(snapshot.snapshotAt)) throw new Error('Audit snapshot needs a valid timestamp');
  const recordedAt = snapshot.recordedAt ?? new Date().toISOString();
  if (!dateIsValid(recordedAt)) throw new Error('Audit recording needs a valid timestamp');
  const runId = `${recordedAt.replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`;
  const index: AuditIndex = previous ? JSON.parse(JSON.stringify(previous)) : {
    schemaVersion: 1, trackingStartedAt: recordedAt, latestRunId: '', snapshotHash: '', entities: {}, runs: [], recordRuns: {},
  };
  const keyIndex = new Map<string, Set<string>>();
  for (const entity of Object.values(index.entities)) for (const key of [...entity.keys, ...(entity.kind === 'movie' ? movieIdentityKeys(entity.data) : [])]) {
    const ids = keyIndex.get(key) ?? new Set(); ids.add(entity.id); keyIndex.set(key, ids);
  }
  const active = new Set<string>();
  const changes: AuditChange[] = [];
  const decisions: AuditDecision[] = [...(snapshot.decisions ?? [])];
  const aliases = snapshot.cinemaAliases ?? {};
  const canonicalCinema = (name: string) => aliases[name] ?? name;
  const importInput = snapshot.inputs.find(input => input.status === 'imported');

  const register = (candidate: Candidate): string => {
    const matches = new Set(candidate.keys.flatMap(key => [...(keyIndex.get(key) ?? [])]));
    const compatible = [...matches].filter(id => {
      const historical = index.entities[id];
      return !active.has(id) && historical.kind === candidate.kind
        && !(candidate.kind === 'movie' && historical.data.id && candidate.data.id && historical.data.id !== candidate.data.id)
        && !(candidate.kind === 'movie' && historical.data.imdbId && candidate.data.imdbId
          && historical.data.imdbId !== candidate.data.imdbId);
    });
    const publishedIdentity = compatible.filter(id => candidate.kind === 'movie' && candidate.data.id && index.entities[id].data.id === candidate.data.id);
    const listedPublishedIdentity = publishedIdentity.filter(id => index.entities[id].listed);
    const exactIdentity = compatible.filter(id => candidate.data.imdbId && index.entities[id].data.imdbId === candidate.data.imdbId);
    const available = listedPublishedIdentity.length ? listedPublishedIdentity : publishedIdentity.length ? publishedIdentity : exactIdentity.length ? exactIdentity : compatible;
    const id = available.length === 1 ? available[0] : `${candidate.kind}-${hash(candidate.keys.join('|'))}`;
    if (active.has(id)) throw new Error(`Ambiguous audit identity: ${candidate.label}`);
    if (available.length > 1) decisions.push({ entity: 'pipeline', subject: candidate.label, provider: 'audit', action: 'identity-review', details: { matches: available, reason: 'Multiple historical identities match; not automatically merged.' } });
    const old = index.entities[id];
    const observations = candidate.observations.filter(item => dateIsValid(item.at));
    const sourceNames = [...new Set(observations.map(item => item.source))].sort();
    const observedTimes = observations.map(item => item.at).sort((a, b) => Date.parse(a) - Date.parse(b));
    const firstAt = observedTimes[0] ?? null;
    const lastAt = observedTimes[observedTimes.length - 1] ?? null;
    const firstSourceNames = [...new Set(observations.filter(item => Date.parse(item.at) === Date.parse(firstAt!)).map(item => item.source))].sort();
    const lastSourceNames = [...new Set(observations.filter(item => Date.parse(item.at) === Date.parse(lastAt!)).map(item => item.source))].sort();
    const entity: AuditEntity = old ?? {
      id, kind: candidate.kind, label: candidate.label, keys: candidate.keys, listed: true,
      firstRecordedAt: recordedAt, firstSeenAt: firstAt, lastSeenAt: lastAt, lastChangedAt: previous ? recordedAt : null,
      firstSources: firstSourceNames, lastSources: lastSourceNames, sources: {}, firstRunId: runId, lastRunId: runId,
      changedInRunId: runId, data: {},
    };
    const fields: AuditChange['fields'] = {};
    for (const key of new Set([...Object.keys(entity.data), ...Object.keys(candidate.data)])) {
      if (stable(entity.data[key]) !== stable(candidate.data[key])) fields[key] = { before: entity.data[key] ?? null, after: candidate.data[key] ?? null };
    }
    if (old && !old.listed) fields.listed = { before: false, after: true };
    const latestBySource = new Map<string, Observation>();
    for (const observation of observations) {
      const latest = latestBySource.get(observation.source);
      if (!latest || Date.parse(observation.at) >= Date.parse(latest.at)) latestBySource.set(observation.source, observation);
    }
    for (const [sourceName, observation] of latestBySource) {
      const cached = entity.sources[sourceName];
      if (!cached || (Date.parse(observation.at) >= Date.parse(cached.lastSeenAt) && stable(cached.details) !== stable(observation.details))) {
        fields[`source.${sourceName}`] = { before: cached?.details ?? null, after: observation.details };
      }
    }
    const action: AuditChange['action'] = !old ? (previous ? 'added' : 'baseline') : !old.listed ? 'returned' : 'modified';
    if (!old || Object.keys(fields).length) {
      changes.push({ entityId: id, kind: candidate.kind, label: candidate.label, action, sources: sourceNames, fields });
      if (action !== 'baseline') entity.lastChangedAt = recordedAt;
      entity.changedInRunId = runId;
    }
    for (const observation of observations) {
      const source = entity.sources[observation.source];
      if (!source) entity.sources[observation.source] = {
        firstSeenAt: observation.at, lastSeenAt: observation.at, firstName: observation.name, lastName: observation.name,
        firstUrl: observation.url, lastUrl: observation.url, details: observation.details,
      };
      else {
        if (Date.parse(observation.at) < Date.parse(source.firstSeenAt)) { source.firstSeenAt = observation.at; source.firstName = observation.name; source.firstUrl = observation.url; }
        if (Date.parse(observation.at) >= Date.parse(source.lastSeenAt)) { source.lastSeenAt = observation.at; source.lastName = observation.name; source.lastUrl = observation.url; source.details = observation.details; }
      }
    }
    if (firstAt && (!entity.firstSeenAt || Date.parse(firstAt) < Date.parse(entity.firstSeenAt))) { entity.firstSeenAt = firstAt; entity.firstSources = firstSourceNames; }
    if (lastAt && (!entity.lastSeenAt || Date.parse(lastAt) >= Date.parse(entity.lastSeenAt))) { entity.lastSeenAt = lastAt; entity.lastSources = lastSourceNames; }
    entity.data = candidate.data; entity.label = candidate.label; entity.listed = true;
    entity.movieId = candidate.movieId; entity.cinemaId = candidate.cinemaId;
    entity.keys = [...new Set([...entity.keys, ...candidate.keys])]; entity.lastRunId = runId;
    index.entities[id] = entity; active.add(id);
    for (const key of entity.keys) { const ids = keyIndex.get(key) ?? new Set(); ids.add(id); keyIndex.set(key, ids); }
    return id;
  };

  const cinemaData = new Map<string, any>();
  const cinemaObservations = new Map<string, Observation[]>();
  for (const movie of snapshot.movies) for (const cinema of movie.cinemas ?? []) {
    const name = canonicalCinema(cinema.name);
    const existing = cinemaData.get(name) ?? {};
    cinemaData.set(name, { ...existing, ...Object.fromEntries(Object.entries(rawCinema(cinema)).filter(([, value]) => value != null && value !== '')), name });
  }
  for (const movie of snapshot.movies) for (const times of Object.values(movie.showings ?? {})) for (const entries of Object.values(times)) for (const slot of entries) {
    const name = canonicalCinema(slot.cinema);
    if (!cinemaData.has(name)) cinemaData.set(name, { name });
  }
  for (const input of snapshot.inputs) for (const raw of input.movies) {
    for (const cinema of raw.cinemas ?? []) {
      const name = canonicalCinema(cinema.name);
      const entries = cinemaObservations.get(name) ?? [];
      entries.push(...sourceObservation(input, cinema.name, cinema.url ?? raw.url ?? null, rawCinema(cinema)));
      cinemaObservations.set(name, entries);
    }
  }
  const cinemaIds = new Map<string, string>();
  for (const [name, details] of cinemaData) {
    const observations = cinemaObservations.get(name) ?? (importInput ? sourceObservation(importInput, name, details.url ?? null, details) : []);
    const names = [name, ...Object.keys(aliases).filter(alias => aliases[alias] === name)];
    cinemaIds.set(name, register({ kind: 'cinema', label: name, keys: names.map(n => `cinema:${normalize(n)}`), data: details, observations }));
  }

  const rawAssignments = new Map<any, Movie>();
  for (const input of snapshot.inputs) for (const raw of input.movies) {
    const linked = raw.subject ? snapshot.movies.filter(movie => movie.sourceAliases?.some(alias => alias.source === input.name && alias.subject === raw.subject)) : [];
    const candidates = snapshot.movies.filter(movie => [movie.title, ...(movie.sourceTitles ?? [])]
      .some(name => normalize(parseTitle(name).baseTitle) !== '' && normalize(parseTitle(name).baseTitle) === normalize(parseTitle(raw.title).baseTitle))
      && (!movie.year || !raw.year || Math.abs(movie.year - Number(raw.year)) <= 1));
    const exactUrl = candidates.filter(movie => raw.url && movie.url === raw.url);
    const matched = linked.length === 1 ? linked[0] : exactUrl.length === 1 ? exactUrl[0] : candidates.length === 1 ? candidates[0] : null;
    if (matched) rawAssignments.set(raw, matched);
    else if (candidates.length > 1) decisions.push({ entity: 'movie', subject: raw.title, provider: 'audit', action: 'source-assignment-ambiguous',
      details: { source: input.name, candidateTitles: candidates.map(movie => movie.title), reason: 'Source observation was not assigned to multiple records by guesswork.' } });
  }

  for (const movie of snapshot.movies) {
    const titleNames = [...new Set([movie.title, ...(movie.sourceTitles ?? [])])].sort();
    const titleKeys = titleNames.map(name => normalize(parseTitle(name).baseTitle)).filter(Boolean).map(name => `movie-title:${name}:${movie.year ?? ''}`);
    const keys = [...movieIdentityKeys(movie), ...(movie.imdbId ? [`imdb:${movie.imdbId}`] : []), ...(movie.url ? [`movie-url:${movie.url}`] : []), ...titleKeys];
    const matching = snapshot.inputs.flatMap(input => input.movies
      .filter(raw => rawAssignments.get(raw) === movie)
      .map(raw => ({ input, raw })));
    const observations = matching.flatMap(({ input, raw }) => sourceObservation(input, raw.title, raw.url ?? null, publicMovie(raw)));
    if (!observations.length && importInput) observations.push(...sourceObservation(importInput, movie.title, movie.url, publicMovie(movie)));
    const movieId = register({ kind: 'movie', label: movie.originalTitle || movie.tmdbTitle || movie.title, keys, data: { ...publicMovie(movie), sourceTitles: titleNames }, observations });
    const slots = new Map<string, { date: string; time: string; cinema: string; versions: string[][]; presentations: any[] }>();
    for (const [date, times] of Object.entries(movie.showings ?? {})) for (const [time, entries] of Object.entries(times)) for (const entry of entries) {
      const cinema = canonicalCinema(entry.cinema);
      const key = `${cinema}|${date}|${time}`;
      const slot = slots.get(key) ?? { date, time, cinema, versions: [], presentations: [] };
      const version = [...new Set(entry.variants)].sort();
      if (!slot.versions.some(existing => stable(existing) === stable(version))) slot.versions.push(version);
      const description = sanitizeAudit({ variants: version, modality: entry.modality, alternatives: entry.alternatives, edition: entry.edition });
      if (!slot.presentations.some(existing => stable(existing) === stable(description))) slot.presentations.push(description);
      slots.set(key, slot);
    }
    for (const { date, time, cinema, versions, presentations } of slots.values()) {
      versions.sort((a, b) => stable(a).localeCompare(stable(b)));
      presentations.sort((a, b) => stable(a).localeCompare(stable(b)));
      const variants = [...new Set(versions.flat())].sort();
      const data = { date, time, cinema, variants, versions, presentations, movieTitle: movie.title };
      const screeningObservations = matching.flatMap(({ input, raw }) => (raw.showings ?? [])
        .filter((slot: any) => typeof slot.date === 'string' && slot.date.slice(0, 10) === date && slot.time === time && canonicalCinema(slot.cinema) === cinema)
        // A source description belongs to the resolved viewing even when its tags disagree or are less specific.
        .flatMap((slot: any) => sourceObservation(input, raw.title, slot.url ?? raw.url ?? null,
          { ...slot, rawTitle: slot.rawTitle ?? raw.rawTitle ?? raw.title, movieVariants: slot.movieVariants ?? raw.variants ?? [] })));
      if (!screeningObservations.length && importInput) screeningObservations.push(...sourceObservation(importInput, movie.title, movie.url, data));
      const cinemaId = cinemaIds.get(cinema);
      register({ kind: 'screening', label: `${movie.title} · ${cinema} · ${date} ${time}`, keys: [`screening:${movieId}:${cinemaId ?? cinema}:${date}:${time}`], data, observations: screeningObservations, movieId, cinemaId });
    }
  }

  for (const entity of Object.values(index.entities)) if (entity.listed && !active.has(entity.id)) {
    entity.listed = false; entity.lastChangedAt = recordedAt; entity.changedInRunId = runId;
    changes.push({ entityId: entity.id, kind: entity.kind, label: entity.label, action: 'no-longer-listed', sources: entity.lastSources, fields: { listed: { before: true, after: false } } });
  }
  const counts = { cinema: 0, movie: 0, screening: 0 };
  for (const id of active) counts[index.entities[id].kind]++;
  const changeCounts = { baseline: 0, added: 0, modified: 0, returned: 0, 'no-longer-listed': 0 };
  for (const change of changes) changeCounts[change.action]++;
  const run: AuditRun = sanitizeAudit({
    id: runId, recordedAt, snapshotAt: snapshot.snapshotAt, mode: previous ? snapshot.mode : 'baseline',
    status: snapshot.inputs.some(source => source.status === 'failed' || source.status === 'cached') ? 'partial' : 'success',
    sources: snapshot.inputs.map(({ movies, ...source }) => source), counts, changes: changeCounts,
    decisionCount: decisions.length, changesList: changes, decisions,
    notes: [
      ...(!previous ? ['Baseline records were already present when tracking started; their original creation dates are unknown.'] : []),
      'No longer listed means absent from this output snapshot, not confirmed deletion or cancellation.',
      'A screening groups one movie, cinema, date, and time; its format variants are retained together.',
      ...(snapshot.notes ?? []),
    ],
  });
  const { changesList, decisions: decisionDetails, notes, ...summary } = run;
  index.latestRunId = runId;
  index.snapshotHash = auditFingerprint(snapshot);
  index.runs.unshift(summary);
  if (index.recordRuns) indexRunRecords(index, run);
  return { index: sanitizeAudit(index), run };
}

function indexRunRecords(index: AuditIndex, run: AuditRun) {
  const relevant = new Set(run.changesList.map(change => change.entityId));
  const byName = new Map<string, Set<string>>();
  for (const entity of Object.values(index.entities)) {
    const names = [entity.label, entity.data.title, entity.data.originalTitle, ...(entity.data.sourceTitles ?? []),
      ...Object.values(entity.sources).flatMap(source => [source.firstName, source.lastName])];
    for (const name of names.filter(Boolean)) {
      const key = `${entity.kind}:${name}`;
      const ids = byName.get(key) ?? new Set<string>(); ids.add(entity.id); byName.set(key, ids);
    }
  }
  for (const decision of run.decisions) {
    const names = [decision.subject, decision.details.canonical, ...(Array.isArray(decision.details.titles) ? decision.details.titles : [])];
    for (const name of names) for (const id of byName.get(`${decision.entity}:${name}`) ?? []) relevant.add(id);
  }
  for (const id of relevant) {
    const reports = index.recordRuns![id] ?? []; if (!reports.includes(run.id)) reports.push(run.id);
    index.recordRuns![id] = reports;
  }
}

export const AUDIT_DIRECTORY = path.join(__dirname, '../public/audit');

function writeAtomic(filename: string, data: unknown) {
  const temporary = `${filename}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(data)); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

/** Upgrade the query index using existing immutable reports, without inventing a run. */
export function ensureAuditRunIndex(directory = AUDIT_DIRECTORY): void {
  const filename = path.join(directory, 'index.json');
  if (!fs.existsSync(filename)) return;
  const index: AuditIndex = JSON.parse(fs.readFileSync(filename, 'utf-8'));
  if (index.schemaVersion !== 1) throw new Error('Unsupported audit schema');
  if (index.recordRuns) return;
  index.recordRuns = {};
  for (const run of index.runs) indexRunRecords(index, JSON.parse(fs.readFileSync(path.join(directory, 'runs', `${run.id}.json`), 'utf-8')));
  writeAtomic(filename, index);
}

export function recordAudit(snapshot: AuditSnapshot, directory = AUDIT_DIRECTORY): AuditRun {
  ensureAuditRunIndex(directory);
  const indexPath = path.join(directory, 'index.json');
  const previous = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as AuditIndex : null;
  if (previous && previous.schemaVersion !== 1) throw new Error('Unsupported audit schema; refusing to overwrite history');
  const { index, run } = buildAudit(previous, snapshot);
  fs.mkdirSync(path.join(directory, 'runs'), { recursive: true });
  // Publish immutable run data before atomically switching the current index.
  writeAtomic(path.join(directory, 'runs', `${run.id}.json`), run);
  writeAtomic(indexPath, index);
  return run;
}

export function recordImportedAudit(data: { movies: Movie[]; scrapedAt: string }, directory = AUDIT_DIRECTORY): void {
  const snapshot: AuditSnapshot = {
    movies: data.movies, snapshotAt: data.scrapedAt, mode: 'import',
    inputs: [{ name: 'published snapshot', status: 'imported', observedAt: data.scrapedAt, movies: [],
      message: 'Imported output; original listing sources and API selection traces were not included.' }],
    notes: ['Resource URLs in imported records identify the selected resource, not how it was searched or selected.'],
  };
  const indexPath = path.join(directory, 'index.json');
  if (fs.existsSync(indexPath)) {
    const previous: AuditIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (previous.snapshotHash === auditFingerprint(snapshot)) return;
  }
  recordAudit(snapshot, directory);
}

export function recordAuditFailure(sources: AuditSource[], message: string, directory = AUDIT_DIRECTORY): void {
  const indexPath = path.join(directory, 'index.json');
  if (!fs.existsSync(indexPath)) return;
  const index: AuditIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const recordedAt = new Date().toISOString();
  const id = `${recordedAt.replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`;
  const counts = { cinema: 0, movie: 0, screening: 0 };
  for (const entity of Object.values(index.entities)) if (entity.listed) counts[entity.kind]++;
  const run: AuditRun = sanitizeAudit({ id, recordedAt, snapshotAt: index.runs[0]?.snapshotAt ?? recordedAt,
    mode: 'scrape', status: 'failed', sources, counts, decisionCount: 1,
    changes: { baseline: 0, added: 0, modified: 0, returned: 0, 'no-longer-listed': 0 }, changesList: [],
    decisions: [{ entity: 'pipeline', subject: 'Refresh', provider: 'pipeline', action: 'failed', details: { message } }],
    notes: ['Refresh failed; the last successful entity snapshot was preserved.'],
  });
  const { changesList, decisions, notes, ...summary } = run;
  index.runs.unshift(summary); index.latestRunId = id;
  fs.mkdirSync(path.join(directory, 'runs'), { recursive: true });
  writeAtomic(path.join(directory, 'runs', `${id}.json`), run); writeAtomic(indexPath, index);
}
