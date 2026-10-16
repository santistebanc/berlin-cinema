import type { AuditChange, AuditRun } from '../types/audit';

export function latestChanges(run: AuditRun): AuditChange[] {
  return run.mode === 'baseline' ? [] : run.changesList.filter(change => change.action !== 'baseline');
}

export function recordEvents(runs: AuditRun[], entityId: string) {
  return runs.flatMap(run => run.changesList.filter(change => change.entityId === entityId)
    .map(change => ({ runId: run.id, at: run.recordedAt, change })))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.runId.localeCompare(a.runId));
}

export function fieldHistory(runs: AuditRun[], entityId: string, field: string) {
  return recordEvents(runs, entityId).filter(event => Object.hasOwnProperty.call(event.change.fields, field))
    .map(event => ({ ...event, ...event.change.fields[field] }));
}
