import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { Entity, FieldValue, Observation, Override, ReviewIssue, fingerprint } from './domain';
import { attributeHistoricalObservation, readState } from './state-format';
import { fieldEvidenceRole } from './field-evidence';

interface State {
  schemaVersion: 1 | 2; revision: number;
  observations: Record<string, Observation>;
  heads: Record<string, { id: string; observedAt: string; active: boolean; withdrawnAt?: string }>;
  entities: Record<string, Entity>;
  links: Record<string, { entityId: string; evidence: string; method: string }>;
  decisions: Record<string, any>; issues: Record<string, ReviewIssue>; overrides: Override[];
  fields: Record<string, FieldValue[]>;
  resources: Record<string, { fetchedAt: string; data: any }>;
  spend: Record<string, { month: string; amount: number; state: string; data: any }>;
  snapshots: { id: number; revision: number; createdAt: string; data: any }[];
  runs: any[]; jobs: any[];
}
const blank = (): State => ({ schemaVersion: 2, revision: 0, observations: {}, heads: {}, entities: {}, links: {},
  decisions: {}, issues: {}, overrides: [], fields: {}, resources: {}, spend: {}, snapshots: [], runs: [], jobs: [] });

/** Git-versioned evidence store. Writers hold a process lock; saves atomically replace one complete file. */
export class PipelineStore {
  private state: State;
  private owner: string | null = null;
  private transactionDepth = 0;
  private reviewPass: Set<string> | null = null;
  private reviewNow: string | undefined;
  private readonly filename: string;
  constructor(filename = process.env.PIPELINE_STATE || path.join(__dirname, '../../pipeline/state.json')) {
    this.filename = filename; this.state = this.load();
  }
  private load(): State {
    if (this.filename === ':memory:' || !fs.existsSync(this.filename)) return blank();
    return readState(JSON.parse(fs.readFileSync(this.filename, 'utf8')));
  }
  refresh() { if (!this.owner && this.filename !== ':memory:') this.state = this.load(); }
  flush() {
    if (this.filename === ':memory:') return;
    if (!this.owner) throw new Error('Pipeline state requires the writer lock before saving');
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(descriptor, JSON.stringify(this.state) + '\n'); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      fs.renameSync(temporary, this.filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  close() { if (this.owner) this.releaseLease(this.owner); }
  transaction<T>(fn: () => T): T {
    const before = JSON.stringify(this.state);
    this.transactionDepth++;
    try { const result = fn(); this.transactionDepth--; if (!this.transactionDepth) this.flush(); return result; }
    catch (error) { this.transactionDepth = Math.max(0, this.transactionDepth - 1); this.state = JSON.parse(before); throw error; }
  }
  get revision(): number { return this.state.revision; }
  bumpRevision() { this.state.revision++; }
  acquireLease(owner: string, _ttl = 120000): boolean {
    if (this.owner) return this.owner === owner;
    this.refresh();
    if (this.state.schemaVersion === 1) throw new Error('Pipeline state v1 is read-only; run pipeline:migrate into a new directory before writing');
    if (this.filename === ':memory:') { this.owner = owner; return true; }
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const lockfile = `${this.filename}.lock`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descriptor = fs.openSync(lockfile, 'wx', 0o600);
        try { fs.writeFileSync(descriptor, JSON.stringify({ owner, pid: process.pid, host: os.hostname() })); }
        catch (error) { fs.unlinkSync(lockfile); throw error; }
        finally { fs.closeSync(descriptor); }
        this.owner = owner;
        try {
          this.state = this.load();
          if (this.state.schemaVersion === 1) throw new Error('Pipeline state changed to v1; migrate before writing');
          return true;
        } catch (error) { this.releaseLease(owner); throw error; }
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const existing = JSON.parse(fs.readFileSync(lockfile, 'utf8'));
          if (existing.host !== os.hostname()) return false;
          try { process.kill(existing.pid, 0); return false; }
          catch (failure: any) { if (failure.code !== 'ESRCH') return false; }
          fs.unlinkSync(lockfile);
        } catch { return false; }
      }
    }
    return false;
  }
  releaseLease(owner: string) {
    if (this.owner !== owner) return;
    if (this.filename !== ':memory:') {
      const lockfile = `${this.filename}.lock`;
      const current = JSON.parse(fs.readFileSync(lockfile, 'utf8'));
      if (current.owner !== owner) throw new Error('Pipeline writer lock changed unexpectedly');
      fs.unlinkSync(lockfile);
    }
    this.owner = null;
  }
  observe(observation: Observation, reactivate = true) {
    observation = attributeHistoricalObservation({ ...observation });
    this.state.observations[observation.id] ??= observation;
    const head = this.state.heads[observation.subject];
    if (!head || Date.parse(observation.observedAt) >= Date.parse(head.observedAt)
      && (!head.withdrawnAt || reactivate && Date.parse(observation.observedAt) >= Date.parse(head.withdrawnAt))) {
      // Expand legacy evidence with attribution without changing its data/hash or renewing cached timestamps.
      const retained = this.state.observations[observation.id];
      this.state.observations[observation.id] = { ...retained,
        ...(observation.provenance ? { provenance: observation.provenance } : {}),
        ...(observation.fields ? { fields: observation.fields } : {}) };
      this.state.heads[observation.subject] = { id: observation.id, observedAt: observation.observedAt,
        active: reactivate || head?.active !== false, ...(!reactivate && head?.withdrawnAt ? { withdrawnAt: head.withdrawnAt } : {}) };
    }
  }
  observations(source?: string, activeOnly = false): Observation[] {
    return Object.entries(this.state.heads).filter(([, head]) => !activeOnly || head.active)
      .map(([subject]) => this.head(subject)!).filter(o => !source || o.source === source).sort((a, b) => a.subject.localeCompare(b.subject));
  }
  retireMissing(source: string, subjects: Set<string>, eligible: (observation: Observation) => boolean = () => true, at?: string) {
    for (const [subject, head] of Object.entries(this.state.heads)) {
      const item = { ...this.state.observations[head.id], observedAt: head.observedAt };
      if (item.source === source && !subjects.has(subject) && eligible(item)) {
        head.active = false;
        if (at && (!head.withdrawnAt || Date.parse(at) > Date.parse(head.withdrawnAt))) head.withdrawnAt = at;
      }
    }
  }
  head(subject: string): Observation | null {
    const head = this.state.heads[subject]; return head ? { ...this.state.observations[head.id], observedAt: head.observedAt } : null;
  }
  entity(id: string): Entity | null { return this.state.entities[id] ?? null; }
  resources(prefix: string) { return Object.entries(this.state.resources).filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({ key, ...value })); }
  entities(kind?: string): Entity[] { return Object.values(this.state.entities).filter(e => !kind || e.kind === kind).sort((a, b) => a.id.localeCompare(b.id)); }
  saveEntity(entity: Entity) { this.state.entities[entity.id] = entity; }
  link(subject: string) { return this.state.links[subject] ?? null; }
  saveLink(subject: string, entityId: string, evidence: string, method: string) {
    if (!this.entity(entityId)) throw new Error('Link target does not exist');
    this.state.links[subject] = { entityId, evidence, method };
  }
  unlink(subject: string) { delete this.state.links[subject]; }
  linkedObservations(entityId: string): Observation[] {
    return Object.entries(this.state.links).filter(([, link]) => link.entityId === entityId)
      .map(([subject]) => this.head(subject)).filter((o): o is Observation => !!o);
  }
  decision(key: string): any { return this.state.decisions[key] ?? null; }
  saveDecision(key: string, data: any) { this.state.decisions[key] = data; }
  issue(input: Omit<ReviewIssue, 'id' | 'firstSeenAt' | 'lastSeenAt'>, now = this.reviewNow ?? new Date().toISOString()): ReviewIssue {
    const id = fingerprint([input.type, input.subject]).slice(0, 28); const old = this.state.issues[id];
    // Raw venue checks precede consolidation. Compare the final group evidence
    // before reopening a reviewed group, rather than its individual row hash.
    const regrouping = old?.details.decisionKey?.startsWith('venue:') && !input.details.decisionKey;
    if (regrouping) input = { ...input, details: { ...input.details,
      reviewedFingerprint: old.status === 'resolved' ? old.fingerprint : old.details.reviewedFingerprint } };
    const firstTouch = this.reviewPass && !this.reviewPass.has(id);
    this.reviewPass?.add(id);
    const issue = { ...input, id, firstSeenAt: old?.firstSeenAt ?? now, lastSeenAt: now,
      occurrences: (old?.occurrences ?? (old ? 1 : 0)) + (firstTouch || !old ? 1 : 0), history: [...(old?.history ?? [])] };
    if (old?.status === 'resolved' && old.fingerprint === input.fingerprint) issue.status = 'resolved';
    const last = issue.history[issue.history.length - 1];
    if (!regrouping && (!last || last.status !== issue.status || last.fingerprint !== issue.fingerprint)) issue.history.push({ at: now, status: issue.status,
      fingerprint: issue.fingerprint, reason: input.details.reason || input.details.resolution || (old?.status === 'resolved' ? 'Changed semantic evidence reopened a reviewed decision' : input.title) });
    this.state.issues[id] = issue; return issue;
  }
  issues(): ReviewIssue[] { return Object.values(this.state.issues).sort((a, b) => b.priority - a.priority || b.lastSeenAt.localeCompare(a.lastSeenAt)); }
  beginReviewPass(now?: string) { this.reviewPass = new Set(); this.reviewNow = now; }
  endReviewPass(now: string) {
    if (!this.reviewPass) return;
    for (const issue of Object.values(this.state.issues)) {
      if (!this.reviewPass.has(issue.id) && issue.status === 'open' && issue.type !== 'field-review') {
        issue.status = 'caution'; issue.details = { ...issue.details, autoResolvedAt: now,
          resolution: 'This issue no longer blocks the current result: newer evidence resolved it, or its source record is no longer active. Original evidence is retained.' };
        issue.history = [...(issue.history ?? []), { at: now, status: 'caution', fingerprint: issue.fingerprint, reason: issue.details.resolution }];
      }
    }
    this.reviewPass = null;
  }
  /** Archive obsolete derived records. Original observations, corrections and verified lookup caches stay intact. */
  cleanupSuperseded(now = new Date().toISOString()) {
    return this.transaction(() => {
      const protectedSubjects = new Set(this.state.overrides.map(override => override.subject));
      const protectedEntities = new Set(this.state.overrides.flatMap(override => [override.targetId,
        override.subject.startsWith('entity:') ? override.subject.slice(7) : undefined]).filter(Boolean));
      const issues = this.issues().filter(issue => issue.status === 'caution' && !protectedSubjects.has(issue.subject)
        && (issue.details.autoResolvedAt || issue.details.resolutionCode === 'compatible-descriptions'));
      const linked = new Set(Object.values(this.state.links).map(link => link.entityId));
      const entities = this.entities('venue').filter(entity => !entity.data.address && entity.data.insideBerlin !== true
        && !entity.data.redirectTo && !linked.has(entity.id) && !protectedEntities.has(entity.id)
        && !this.issues().some(issue => issue.status === 'open' && (issue.subject === `entity:${entity.id}` || issue.details.entityId === entity.id)));
      if (!issues.length && !entities.length) return { archivedIssues: 0, archivedVenues: 0, archiveKey: null };
      const archiveKey = `cleanup-archive:${now}:${randomUUID()}`;
      this.saveResource(archiveKey, { issues, entities, fields: Object.fromEntries(entities.map(entity => [entity.id, this.fields(entity.id)])) }, now);
      for (const issue of issues) delete this.state.issues[issue.id];
      for (const entity of entities) { delete this.state.entities[entity.id]; delete this.state.fields[entity.id]; }
      return { archivedIssues: issues.length, archivedVenues: entities.length, archiveKey };
    });
  }
  resolveIssue(id: string) {
    const issue = this.state.issues[id];
    if (!issue) throw new Error('Review issue not found'); issue.status = 'resolved';
    issue.history = [...(issue.history ?? []), { at: this.reviewNow ?? new Date().toISOString(), status: 'resolved', fingerprint: issue.fingerprint, reason: 'Reviewed by local administrator' }];
  }
  reopenIssue(id: string) { if (this.state.issues[id]) this.state.issues[id].status = 'open'; }
  overrides(subject: string): Override[] { return this.state.overrides.filter(o => o.subject === subject && !o.revokedAt); }
  allOverrides(): Override[] { return [...this.state.overrides].reverse(); }
  addOverride(input: Omit<Override, 'id' | 'createdAt'>): Override {
    const override = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.state.overrides.push(override); this.bumpRevision(); return override;
  }
  revokeOverride(id: string) {
    const override = this.state.overrides.find(item => item.id === id && !item.revokedAt);
    if (!override) throw new Error('Active correction not found'); override.revokedAt = new Date().toISOString(); this.bumpRevision();
    if (override.action === 'link' || override.action === 'separate' || override.patch?.parsed) {
      const previous = this.state.links[override.subject]; delete this.state.links[override.subject];
      const target = previous && this.state.entities[previous.entityId];
      if (target?.data.manualSeparate && !Object.values(this.state.links).some(link => link.entityId === target.id)) target.data.retired = true;
    }
    for (const issue of Object.values(this.state.issues)) {
      if (issue.subject === override.subject || `entity:${issue.details.entityId}` === override.subject) issue.status = 'open';
    }
  }
  fields(entityId: string): FieldValue[] {
    return (this.state.fields[entityId] ?? []).map(field => ({ ...field,
      evidenceRole: fieldEvidenceRole(field, field.observationId ? this.state.observations[field.observationId] : undefined) }));
  }
  retainedSourceDetails(sources: Observation[]): FieldValue[] {
    const subjects = new Set(sources.map(source => source.subject));
    return Object.values(this.state.fields).flat().flatMap(field => {
      const original = field.observationId && this.state.observations[field.observationId];
      if (!original || original.kind !== 'listing' || !subjects.has(original.subject)
        || original.source !== field.source || field.identityVerified || field.correctionId) return [];
      const evidenceRole = fieldEvidenceRole(field, original);
      return evidenceRole === 'source-detail' ? [{ ...field, evidenceRole }] : [];
    });
  }
  saveFields(entityId: string, values: FieldValue[]) { this.state.fields[entityId] = values; }
  resource(key: string) { return this.state.resources[key] ?? null; }
  saveResource(key: string, data: any, now = new Date().toISOString()) { this.state.resources[key] = { fetchedAt: now, data }; }
  spend(month = new Date().toISOString().slice(0, 7)): number {
    return Object.values(this.state.spend).filter(e => e.month === month).reduce((sum, e) => sum + e.amount, 0);
  }
  reserveSpend(amount: number, limit: number, metadata: any, now: string): string | null {
    return this.transaction(() => {
      if (this.spend(now.slice(0, 7)) + amount > limit) return null;
      const id = randomUUID(); this.state.spend[id] = { month: now.slice(0, 7), amount, state: 'reserved', data: metadata }; return id;
    });
  }
  settleSpend(id: string, amount: number) {
    if (this.state.spend[id]) { this.state.spend[id].amount = amount; this.state.spend[id].state = 'settled'; this.flush(); }
  }
  publish(data: any, expectedRevision: number, now: string): number {
    return this.transaction(() => {
      if (this.revision !== expectedRevision) throw new Error('Corrections changed during processing; retry publication');
      const previous = this.state.snapshots[this.state.snapshots.length - 1]; const id = (previous?.id ?? 0) + 1;
      this.state.snapshots.push({ id, revision: expectedRevision, createdAt: now, data });
      this.state.snapshots = this.state.snapshots.slice(-2); return id;
    });
  }
  snapshot(): any | null { return this.state.snapshots[this.state.snapshots.length - 1]?.data ?? null; }
  snapshotInfo(): any {
    const s = this.state.snapshots[this.state.snapshots.length - 1]; return s ? { id: s.id, revision: s.revision, created_at: s.createdAt } : null;
  }
  run(id: string, status: string, data: any, finished = false) {
    let run = this.state.runs.find(item => item.id === id);
    if (!run) { run = { id, started_at: new Date().toISOString() }; this.state.runs.unshift(run); }
    Object.assign(run, { status, data, finished_at: finished ? new Date().toISOString() : null }); this.state.runs = this.state.runs.slice(0, 50);
  }
  runs(): any[] { return this.state.runs; }
  createJob(kind: string): string {
    const id = randomUUID(); this.state.jobs.unshift({ id, status: 'queued', created_at: new Date().toISOString(), data: { kind } });
    this.state.jobs = this.state.jobs.slice(0, 30); return id;
  }
  jobs(): any[] { return this.state.jobs; }
  updateJob(id: string, status: string, data: any) {
    const job = this.state.jobs.find(item => item.id === id); if (job) Object.assign(job, { status, data });
  }
}
