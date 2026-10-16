export interface ReviewColumn {
  id: string;
  label: string;
  description?: string;
  source?: string;
  kind: 'source' | 'candidate' | 'current';
  accepted?: boolean;
  fields: Record<string, any[]>;
  records: { id: string; url?: string; observedAt?: string; related?: boolean; label?: string }[];
}
export interface ReviewOption {
  id: string; label: string; description: string;
  action: 'link' | 'separate' | 'parse' | 'metadata' | 'fields' | 'screening' | 'dismiss';
  targetId?: string; values?: any;
}
export interface ReviewEvidence {
  layout?: 'screening' | 'identity';
  columns: ReviewColumn[];
  fields: { key: string; label: string; secondary?: boolean }[];
  question: string;
  impact: string;
  rule: string;
  checks: { label: string; status: 'passed' | 'missing' | 'conflict'; detail: string }[];
  reasons: { code: string; title: string; detail: string }[];
  metrics: { question: string; choice: string; confidence: number; probability: number; threshold: number | null }[];
  options: ReviewOption[];
}
