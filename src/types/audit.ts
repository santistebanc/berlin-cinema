export type AuditKind = 'cinema' | 'movie' | 'screening';
export type SourceStatus = 'fresh' | 'cached' | 'failed' | 'skipped' | 'imported';

export interface AuditSource {
  name: string;
  status: SourceStatus;
  observedAt?: string;
  message?: string;
}

export interface AuditDecision {
  entity: 'movie' | 'cinema' | 'pipeline';
  subject: string;
  provider: string;
  action: string;
  at?: string;
  details: Record<string, unknown>;
}

export interface SourceHistory {
  firstSeenAt: string;
  lastSeenAt: string;
  firstName: string;
  lastName: string;
  firstUrl: string | null;
  lastUrl: string | null;
  details: Record<string, unknown>;
}

export interface AuditEntity {
  id: string;
  kind: AuditKind;
  label: string;
  keys: string[];
  listed: boolean;
  firstRecordedAt: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastChangedAt: string | null;
  firstSources: string[];
  lastSources: string[];
  sources: Record<string, SourceHistory>;
  firstRunId: string;
  lastRunId: string;
  changedInRunId: string;
  movieId?: string;
  cinemaId?: string;
  data: Record<string, any>;
}

export interface AuditChange {
  entityId: string;
  kind: AuditKind;
  label: string;
  action: 'baseline' | 'added' | 'modified' | 'returned' | 'no-longer-listed';
  sources: string[];
  fields: Record<string, { before: unknown; after: unknown }>;
}

export interface AuditRunSummary {
  id: string;
  recordedAt: string;
  snapshotAt: string;
  mode: 'baseline' | 'scrape' | 'import' | 'backfill';
  status: 'success' | 'partial' | 'failed';
  sources: AuditSource[];
  counts: Record<AuditKind, number>;
  changes: Record<AuditChange['action'], number>;
  decisionCount: number;
}

export interface AuditRun extends AuditRunSummary {
  changesList: AuditChange[];
  decisions: AuditDecision[];
  notes: string[];
}

export interface AuditIndex {
  schemaVersion: 1;
  trackingStartedAt: string;
  latestRunId: string;
  snapshotHash: string;
  entities: Record<string, AuditEntity>;
  runs: AuditRunSummary[];
  /** Relevant change/evidence reports per record; materialized for static history queries. */
  recordRuns?: Record<string, string[]>;
}
