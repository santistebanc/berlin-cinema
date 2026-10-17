import { normalize, ReviewIssue, fingerprint } from './domain';
import { semanticEvidence } from './correction-evidence';
import { PipelineStore } from './store';
import { reviewEvidence } from './review-evidence';
import type { Entity } from './domain';
import { selectEvidence } from './evidence-policy';
import { Diagnostic, ResolvedField, ResolutionResultSchema, ResolutionResult } from '../../shared/contracts';

export function resolutionOutcomes(store: PipelineStore, entities: Entity[], movies: any[], now: string) {
  const outcomes: ResolutionResult[] = [];
  const actionable = store.issues().filter(issue => issue.status === 'open');
  for (const entity of new Map(entities.map(item => [item.id, item])).values()) {
    const observations = store.linkedObservations(entity.id);
    const subjects = new Set(observations.map(item => item.subject));
    const questions = actionable.filter(issue => issue.details.entityId === entity.id || subjects.has(issue.subject)
      || (issue.details.observations ?? []).some((item: any) => subjects.has(item.subject))
      || issue.subject === `entity:${entity.id}` || issue.subject === `metadata:${entity.id}`);
    const movie = movies.find(movie => movie.sourceAliases?.some((alias: any) => alias.entityId === entity.id || subjects.has(alias.subject)) || movie.id === entity.id);
    const fields = movie?.resolution.fields ?? selectEvidence(store.fields(entity.id), store).fields;
    const unverifiedLocation = entity.kind === 'venue' && entity.data.insideBerlin !== true && !store.overrides(`entity:${entity.id}`)
      .some(item => typeof item.patch?.fields?.insideBerlin === 'boolean');
    const venueFields: ResolvedField[] = entity.kind !== 'venue' ? [] : ['name', 'address', 'insideBerlin', 'websiteUrl'].map(field => {
      const correction = store.overrides(`entity:${entity.id}`).filter(item => Object.hasOwn(item.patch?.fields ?? {}, field)).slice(-1)[0];
      const value = correction ? correction.patch!.fields[field] : field === 'name' ? entity.name : entity.data[field];
      if (!correction && field === 'websiteUrl' && entity.data.websiteResolution) return entity.data.websiteResolution;
      return { field, value: correction && value === null ? { state: 'cleared', correctionId: correction.id, reason: correction.reason }
        : value == null || value === '' || field === 'insideBerlin' && unverifiedLocation ? { state: 'unknown' } : { state: 'known', value },
        reason: correction ? correction.reason : field === 'insideBerlin' ? 'Verified location or explicit applicable correction required' : 'Established linked venue evidence',
        supportingObservationIds: observations.map(item => item.id), alternatives: [], unresolvedQuestions: [] };
    });
    const identityQuestions = questions.filter(issue => issue.type !== 'metadata-match' && issue.type !== 'correction-conflict');
    const abstained = unverifiedLocation || identityQuestions.length > 0;
    const result = ResolutionResultSchema.parse({ schemaVersion: 1, outcome: abstained ? 'abstained' : 'selected',
      entity: abstained ? null : { id: entity.id, kind: entity.kind, name: entity.name },
      reason: abstained ? 'Identity or venue eligibility evidence is insufficient; retain the established safe fallback'
        : entity.kind === 'venue' ? 'Established venue evidence and applicable location corrections determine publication eligibility'
          : entity.data.tmdbId ? 'Verified metadata identity with protected source links' : 'Source-only identity; optional metadata is separate from publication eligibility',
      supportingObservationIds: observations.map(item => item.id),
      conflictingEntityIds: [...new Set(identityQuestions.flatMap(issue => (issue.details.candidates ?? []).map((candidate: any) => String(candidate.id))))],
      fields: [...fields, ...venueFields],
      unresolvedQuestions: questions.map(issue => issue.details.question || issue.title) });
    outcomes.push(result); store.saveResource(`resolution:${entity.id}`, result, now);
    if (movie) movie.resolution = { ...movie.resolution, ...(abstained ? { outcome: 'abstained', entity: null } : {}),
      conflictingEntityIds: [...new Set([...movie.resolution.conflictingEntityIds, ...result.conflictingEntityIds])],
      unresolvedQuestions: [...new Set([...movie.resolution.unresolvedQuestions, ...result.unresolvedQuestions])] };
  }
  const choices = outcomes.flatMap(outcome => outcome.fields);
  const metrics = { automaticResolution: outcomes.filter(outcome => outcome.outcome === 'selected').length + choices.filter(field => ['known', 'cleared'].includes(field.value.state)).length,
    abstention: outcomes.filter(outcome => outcome.outcome === 'abstained').length + choices.filter(field => field.value.state === 'unknown').length,
    actionableReview: actionable.length,
    recurringIssues: actionable.filter(issue => (issue.occurrences ?? 1) > 1).length,
    reviewedReversals: store.issues().filter(issue => !issue.details.canonicalReviewId).reduce((count, issue) => count + (issue.history ?? []).filter((event, index, history) => event.status === 'open'
      && index > 0 && history[index - 1].status === 'resolved' && history[index - 1].fingerprint !== event.fingerprint).length, 0) };
  store.saveResource('resolution-metrics:latest', metrics, now);
  if (!store.resource('resolution-metrics:baseline')) store.saveResource('resolution-metrics:baseline', metrics, now);
  const resolutionDiagnostics: Diagnostic[] = store.issues().filter(issue => issue.lastSeenAt === now || issue.details.autoResolvedAt === now)
    .map(issue => ({ schemaVersion: 1, category: issue.status === 'open' ? 'actionable'
      : ['source-unavailable', 'provider-configuration'].includes(issue.type) ? 'recovery' : 'data-quality',
      stage: 'resolution', code: issue.type, sourceInstanceId: issue.details.observation?.source ?? '',
      reason: issue.details.reason || issue.details.resolution || issue.title, retryable: issue.type === 'source-unavailable',
      evidence: { issueId: issue.id, status: issue.status, question: issue.details.question ?? issue.title,
        fallback: issue.details.fallback ?? null, publicationImpact: issue.details.publicationImpact ?? null } }));
  for (const field of new Map(choices.filter(field => field.value.state === 'unknown' && field.unresolvedQuestions.length)
    .map(field => [fingerprint(field), field])).values()) resolutionDiagnostics.push({ schemaVersion: 1, category: 'data-quality',
      stage: 'field-selection', code: 'optional-field-conflict', sourceInstanceId: '', reason: field.reason, retryable: false,
      evidence: { field: field.field, supportingObservationIds: field.supportingObservationIds, alternatives: field.alternatives } });
  return { resolutions: outcomes, resolutionMetrics: metrics, resolutionDiagnostics };
}

/** Keep the existing review commands and evidence renderer; classify and group their decisions. */
export function finalizeResolutionReview(store: PipelineStore, now: string) {
  const open = store.issues().filter(issue => issue.status === 'open');
  const groups = new Map<string, ReviewIssue[]>();
  for (const issue of open) {
    const operational = ['source-unavailable', 'provider-configuration', 'legacy-evidence'].includes(issue.type);
    const optional = issue.type === 'unknown-marker' || issue.type === 'metadata-match'
      && !issue.details.candidates?.length && !issue.details.tmdbId && !issue.details.selectedId;
    if (operational || optional) {
      store.issue({ ...issue, status: 'caution', details: { ...issue.details, category: operational ? 'recovery' : 'data-quality',
        resolution: issue.details.resolution || 'Usable source-backed records remain available; no fact can be established by retrying a human decision.' } }, now);
      continue;
    }
    const observation = issue.details.observation ?? store.head(issue.subject);
    const entity = store.entity(issue.details.entityId || issue.subject.replace(/^entity:/, ''));
    // Group physical venue questions across source rows. Entity field decisions
    // and field-correction conflicts remain their own actionable questions.
    const venue = observation?.kind === 'venue' && !issue.details.correction?.patch?.fields;
    const key = venue ? `venue:${normalize(observation?.data.name || entity?.name || '')}:${normalize(observation?.data.address || entity?.data.address || '')}`
      : issue.subject.startsWith('entity:') || issue.subject.startsWith('metadata:') ? issue.subject : `source:${issue.subject}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  for (const [key, issues] of groups) {
    const retainedId = store.resource(`review-decision:${key}`)?.data.id;
    issues.sort((a, b) => Number(b.id === retainedId) - Number(a.id === retainedId)
      || b.priority - a.priority || a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id));
    const main = issues[0];
    const observations = [...new Map([
      ...issues.flatMap(issue => [issue.details.observation, ...(issue.details.observations ?? [])]).filter(Boolean),
      ...store.observations(undefined, true).filter(item => item.kind === 'venue'
        && key === `venue:${normalize(item.data.name || '')}:${normalize(item.data.address || '')}`),
    ].map(item => [item.subject, item])).values()];
    const groupedEntityIds = new Set(observations.map(item => store.link(item.subject)?.entityId).filter(Boolean));
    const candidates = [...new Map(issues.flatMap(issue => issue.details.candidates ?? []).map(item => [item.id, item])).values()]
      .filter(item => !key.startsWith('venue:') || !groupedEntityIds.has(item.id));
    const decisionFingerprint = key.startsWith('venue:') ? fingerprint(semanticEvidence({ key,
      observations: observations.map(item => ({ subject: item.subject, data: item.data, fields: item.fields,
        lineage: item.provenance?.upstreamLineage })).sort((a, b) => a.subject.localeCompare(b.subject)),
      candidates: [...candidates].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      corrections: issues.map(issue => issue.details.correction?.id).filter(Boolean).sort() })) : main.fingerprint;
    const evidence = reviewEvidence(store, { ...main, details: { ...main.details, observations, candidates } });
    store.issue({ ...main, fingerprint: decisionFingerprint,
      status: main.details.reviewedFingerprint === decisionFingerprint ? 'resolved' : main.status,
      details: { ...main.details, category: 'actionable', decisionKey: key, observations, candidates,
        question: evidence.question, stoppedBecause: main.details.reason || main.details.decision?.reason || evidence.rule,
        fallback: main.details.fallback || evidence.impact, publicationImpact: evidence.impact,
        choices: evidence.options, relatedIssueIds: issues.slice(1).map(issue => issue.id) } }, now);
    store.saveResource(`review-decision:${key}`, { id: main.id }, now);
    for (const issue of issues.slice(1)) store.issue({ ...issue, status: 'caution', details: { ...issue.details,
      category: 'data-quality', canonicalReviewId: main.id, resolution: 'Evidence is retained in the consolidated actionable decision.' } }, now);
  }
}
