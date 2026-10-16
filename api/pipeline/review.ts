import { PipelineStore } from './store';
import { emptyModality, Entity, fingerprint, identity } from './domain';
import { linkEvidence } from './resolve';

export interface ReviewCommand {
  issueId: string; action: 'link' | 'separate' | 'parse' | 'metadata' | 'fields' | 'screening' | 'dismiss';
  revision: number; evidenceFingerprint: string; reason: string; targetId?: string; values?: any;
}
export class ReviewConflict extends Error {}
const isObject = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
export function fieldEvidence(store: PipelineStore, id: string): string {
  return fingerprint({ entity: store.entity(id), fields: store.fields(id).map(({ field, value, source, observationId }) => ({ field, value, source, observationId })) });
}
function modality(value: any) {
  if (!isObject(value) || !['original', 'dubbed', 'unknown'].includes(value.version)
    || ![null, true, false].includes(value.subtitled)
    || [value.spokenLanguage, value.subtitleLanguage].some(v => v !== null && (typeof v !== 'string' || !/^[a-z]{2,3}$/.test(v)))
    || ['projection', 'context', 'unknown'].some(key => !Array.isArray(value[key]) || value[key].some((v: any) => typeof v !== 'string' || v.length > 120))
    || (value.edition !== null && typeof value.edition !== 'string')) throw new Error('Invalid screening properties');
  return { ...emptyModality(), ...value, projection: value.projection.filter(Boolean), context: value.context.filter(Boolean), unknown: value.unknown.filter(Boolean) };
}
const fieldNames = new Set(['name', 'address', 'websiteUrl', 'insideBerlin', 'plot', 'tagline', 'posterUrl', 'backdropUrl', 'director', 'cast', 'year',
  'country', 'runtime', 'genres', 'originalTitle', 'tmdbTitle', 'alternativeTitles', 'originalLanguage', 'trailerUrl', 'ageRating', 'keywords']);
function fields(value: any): Record<string, any> {
  if (!isObject(value) || Object.keys(value).length === 0 || Object.keys(value).some(key => !fieldNames.has(key))) throw new Error('Unknown editable field');
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue;
    if (key === 'insideBerlin') { if (typeof item !== 'boolean') throw new Error('insideBerlin must be true or false'); }
    else if (['year', 'runtime'].includes(key)) {
      if (!Number.isInteger(item) || Number(item) < 0 || Number(item) > (key === 'year' ? 2200 : 2000)) throw new Error('Invalid numeric field');
    } else if (['cast', 'genres', 'alternativeTitles', 'keywords'].includes(key)) {
      if (!Array.isArray(item) || item.some(v => typeof v !== 'string' || v.length > 500)) throw new Error('Expected a list of strings');
    } else if (typeof item !== 'string' || item.length > 20000) throw new Error('Expected text');
    if (/Url$/.test(key) && item) {
      const url = new URL(String(item)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected a public HTTP(S) URL');
    }
  }
  return value;
}

/** The preview and apply paths use the same validation and interpretation. */
export function previewReview(store: PipelineStore, command: ReviewCommand) {
  const issue = store.issues().find(i => i.id === command.issueId);
  if (!issue) throw new Error('Review issue not found');
  if (command.revision !== store.revision || command.evidenceFingerprint !== issue.fingerprint) throw new ReviewConflict('Evidence or corrections changed. Reload this issue before applying a decision.');
  if (typeof command.reason !== 'string' || !command.reason.trim() || command.reason.length > 2000) throw new Error('A short decision reason is required');
  const observation = store.head(issue.subject);
  const entityId = issue.subject.startsWith('entity:') ? issue.subject.slice(7) : issue.details.entityId;
  let patch: any = null; let target: Entity | null = null;
  if (command.action === 'link') {
    if (!observation || !['venue', 'listing'].includes(observation.kind)) throw new Error('This issue does not support identity linking');
    const candidates = issue.details.candidates ?? [];
    target = store.entity(command.targetId!) ?? candidates.find((c: any) => c.id === command.targetId) ?? null;
    if (!target || !['film', 'programme', 'venue'].includes(target.kind)
      || (observation.kind === 'venue' ? target.kind !== 'venue' : target.kind === 'venue')) throw new Error('Choose an appropriate identity candidate');
  } else if (command.action === 'separate') {
    if (!observation || observation.kind !== 'listing') throw new Error('Only source film/programme records can be separated here');
  } else if (command.action === 'parse') {
    if (!observation || observation.kind !== 'listing' || !isObject(command.values)) throw new Error('Choose a source listing to correct');
    const v = command.values;
    if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 1000 || !['film', 'programme'].includes(v.kind)
      || (v.year !== null && (!Number.isInteger(v.year) || v.year < 1800 || v.year > 2200))
      || !Array.isArray(v.alternateTitles) || v.alternateTitles.some((t: any) => typeof t !== 'string')) throw new Error('Invalid parsed title');
    patch = { parsed: { title: v.title, kind: v.kind, year: v.year, alternateTitles: v.alternateTitles,
      modality: modality(v.modality), ambiguous: [] } };
  } else if (command.action === 'metadata') {
    const id = command.values?.tmdbId;
    if (!issue.subject.startsWith('metadata:') || (id !== null && !issue.details.candidates?.some((c: any) => c.id === id))) throw new Error('Choose a supplied TMDb candidate or explicitly choose no match');
    patch = { tmdbId: id };
  } else if (command.action === 'fields') {
    if (!entityId || !store.entity(entityId)) throw new Error('Choose a known entity to correct');
    if (issue.details.fieldEvidence && issue.details.fieldEvidence !== fieldEvidence(store, entityId))
      throw new ReviewConflict('Selected field evidence changed. Find and reopen this record before editing it.');
    patch = { fields: fields(command.values) };
  } else if (command.action === 'screening') {
    if (!issue.subject.startsWith('slot:') || command.values?.mode !== 'same') throw new Error('The same film, cinema, date and time identify one viewing');
    patch = { screening: { mode: command.values.mode, modality: modality(command.values.modality) } };
  } else if (command.action !== 'dismiss') throw new Error('Unknown review action');
  const subject = command.action === 'fields' ? `entity:${entityId}` : issue.subject;
  const metadataCandidate = command.action === 'metadata' ? issue.details.candidates?.find((candidate: any) => candidate.id === patch.tmdbId) : null;
  const fieldDescription = command.action === 'fields' ? Object.entries(patch.fields).map(([key, value]) => key === 'insideBerlin'
    ? value === true ? 'confirm the venue is inside Berlin' : value === false ? 'exclude the venue as outside Berlin' : 'clear its Berlin location decision'
    : `set ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} to ${value === null ? 'empty' : JSON.stringify(value).slice(0, 180)}`).join('; ') : '';
  return { issue, observation, patch, target, subject,
    evidence: observation ? linkEvidence(observation) : issue.details.evidence ?? issue.fingerprint,
    affected: observation ? [observation.subject, store.link(observation.subject)?.entityId, target?.id].filter(Boolean)
      : [subject, entityId].filter(Boolean),
    description: command.action === 'link' ? `Link this source record to ${target!.name}. Recalculate its metadata and screenings.`
      : command.action === 'separate' ? 'Give this source listing a separate identity. Re-evaluate its enrichment and screenings.'
      : command.action === 'dismiss' ? 'Mark this issue reviewed without changing published facts.'
      : command.action === 'metadata' ? patch.tmdbId === null ? 'Keep source information and withhold database enrichment for this identity.'
        : `Use TMDb metadata for ${metadataCandidate.title}${metadataCandidate.year ? ` (${metadataCandidate.year})` : ''}${metadataCandidate.director ? `, directed by ${metadataCandidate.director}` : ''}. Regenerate the affected listings.`
      : command.action === 'fields' ? `Save this correction: ${fieldDescription}. Regenerate the affected listings.`
      : command.action === 'parse' ? `Use the title “${patch.parsed.title}”${patch.parsed.year ? ` (${patch.parsed.year})` : ''} and the corrected screening properties. Re-evaluate its identity and listings.`
      : command.action === 'screening' ? 'Use one screening with the corrected description.'
      : 'Apply this scoped correction and regenerate affected published values.',
  };
}

export function applyReview(store: PipelineStore, command: ReviewCommand) {
  return store.transaction(() => {
    const preview = previewReview(store, command);
    const common = { reason: command.reason.trim(), actor: 'local administrator', evidenceFingerprint: preview.evidence };
    const overrides = [];
    if (command.action === 'link') {
      store.saveEntity(preview.target!);
      overrides.push(store.addOverride({ ...common, subject: preview.subject, action: 'link', targetId: preview.target!.id }));
    } else if (command.action === 'separate') {
      const old = store.link(preview.subject); const listing = preview.observation!;
      const fresh: Entity = { id: identity('separate', `${listing.subject}:${randomSeed()}`),
        kind: preview.issue.details.parsed?.kind || 'film', name: preview.issue.details.parsed?.title || listing.data.title,
        data: { manualSeparate: true, year: Number(listing.data.year) || null, director: listing.data.director || null } };
      store.saveEntity(fresh);
      overrides.push(store.addOverride({ ...common, subject: listing.subject, action: 'separate', targetId: old?.entityId ?? command.targetId ?? fresh.id }));
      overrides.push(store.addOverride({ ...common, subject: listing.subject, action: 'link', targetId: fresh.id }));
    } else if (command.action === 'dismiss') {
      overrides.push(store.addOverride({ ...common, subject: preview.subject, action: 'dismiss' }));
    } else {
      overrides.push(store.addOverride({ ...common, subject: preview.subject, action: 'patch', patch: preview.patch }));
      // A manual location decision identifies this physical source venue as well as its inclusion status.
      if (command.action === 'fields' && preview.observation?.kind === 'venue' && Object.hasOwn(preview.patch.fields, 'insideBerlin'))
        overrides.push(store.addOverride({ ...common, subject: preview.observation.subject, action: 'link', targetId: preview.subject.slice(7) }));
    }
    store.resolveIssue(preview.issue.id);
    return { overrideIds: overrides.map(o => o.id), revision: store.revision, description: preview.description };
  });
}
function randomSeed() { return `${Date.now()}:${Math.random()}`; }
