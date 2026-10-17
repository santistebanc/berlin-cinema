import { createHash } from 'crypto';
import type { EvidenceValue, Provenance, FieldEvidenceRole } from '../../shared/contracts';
export type { Modality } from '../../shared/contracts';
import type { Modality } from '../../shared/contracts';

export const POLICY_VERSION = 'cinema-identity-v1';
export type EntityKind = 'film' | 'programme' | 'venue';
export type SourceName = 'critic.de' | 'berlin.de' | string;
export interface ParsedLabel {
  title: string;
  alternateTitles: string[];
  year: number | null;
  kind: 'film' | 'programme';
  modality: Modality;
  ambiguous: string[];
}
export interface SourceBatch {
  source: SourceName;
  observedAt: string;
  status: 'fresh' | 'cached' | 'failed' | 'skipped';
  complete: boolean;
  movies: any[];
  message?: string;
}
export interface Observation {
  provenance?: Provenance;
  fields?: Record<string, EvidenceValue>;
  id: string;
  subject: string;
  source: string;
  sourceKey: string;
  kind: 'listing' | 'venue' | 'screening' | 'metadata';
  observedAt: string;
  fetchedAt: string;
  fingerprint: string;
  data: Record<string, any>;
}
export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  data: Record<string, any>;
}
export interface Question {
  instructions: string;
  choices: Record<string, string>;
}
export interface DecisionRequest {
  task: 'parse' | 'film' | 'venue' | 'screening' | 'metadata' | 'location';
  state: Record<string, any>;
  questions: Record<string, Question>;
}
export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface DecisionResponse {
  answers: Record<string, ChoiceAnswer>;
  inputTokens: number;
  provider: string;
  model: string;
}
export interface DecisionModel {
  provider: string;
  model: string;
  inputUsdPerMillion: number;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
}
export interface DecisionResult {
  key: string;
  response: DecisionResponse | null;
  accepted: boolean;
  reason: string;
  cached: boolean;
  code?: 'accepted' | 'provider-not-configured' | 'input-too-large' | 'budget-exhausted' | 'low-confidence' | 'provider-error' | 'invalid-response';
  threshold?: number;
}
export interface ReviewIssue {
  occurrences?: number;
  history?: { at: string; status: 'open' | 'caution' | 'resolved'; fingerprint: string; reason: string }[];
  id: string;
  type: string;
  subject: string;
  title: string;
  status: 'open' | 'caution' | 'resolved';
  priority: number;
  fingerprint: string;
  details: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
}
export interface Override {
  id: string;
  subject: string;
  action: 'link' | 'separate' | 'patch' | 'dismiss';
  targetId?: string;
  patch?: Record<string, any>;
  reason: string;
  actor: string;
  evidenceFingerprint: string;
  createdAt: string;
  revokedAt?: string;
}
export interface FieldValue {
  /** Optional only for retained state written before evidence roles were introduced. */
  evidenceRole?: FieldEvidenceRole;
  correctionId?: string;
  field: string;
  value: any;
  source: string;
  observationId: string | null;
  observedAt: string;
  selectedAt: string;
  reason: string;
  identityVerified: boolean;
}
export function stable(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value ?? null);
}
export function fingerprint(value: any): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}
export function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function identity(kind: string, key: string): string { return `${kind}-${fingerprint(key).slice(0, 24)}`; }
export { emptyModality } from '../../src/utils/screeningLabels';
