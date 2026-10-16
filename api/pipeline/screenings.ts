import { DecisionEngine } from './decision-model';
import { Modality, Observation, emptyModality, fingerprint, identity } from './domain';
import { combineModality, modalityConflict, modalityTags, parseMarkers } from './labels';
import { flag } from './resolve';
import { PipelineStore } from './store';

export interface ScreeningInput {
  observation: Observation; filmId: string; venueId: string; cinema: string; modality: Modality; stale: boolean;
}
export interface PublishedScreening {
  id: string; cinema: string; venueId: string; variants: string[]; modality: Modality; edition: string | null;
  uncertain: boolean; stale: boolean; sourceUrls: string[]; observationIds: string[];
  date: string; time: string; alternatives?: Modality[];
  lastObservedAt: string;
}
export function screeningModality(observation: Observation, filmModality: Modality): Modality {
  const raw = observation.data;
  // A per-session language marker overrides a listing-wide language marker; projection/edition are inherited.
  if (raw.variant != null) {
    const specific = parseMarkers(raw.variant);
    if (!specific) return { ...filmModality, version: 'unknown', spokenLanguage: null, subtitleLanguage: null, subtitled: null,
      unknown: [...filmModality.unknown, String(raw.variant)] };
    const base = { ...filmModality, version: 'unknown' as const, spokenLanguage: null, subtitleLanguage: null, subtitled: null };
    return combineModality(base, specific);
  }
  return filmModality;
}

/** Combine descriptions without choosing an arbitrary source when known details disagree. */
function agreedModality(alternatives: Modality[]): Modality {
  const unique = <T>(values: T[], missing: T): T => {
    const known = [...new Set(values.filter(value => value !== missing))];
    return known.length === 1 ? known[0] : missing;
  };
  const merged = alternatives.reduce(combineModality, emptyModality());
  const subtitled = unique(alternatives.map(value => value.subtitleLanguage ? true : value.subtitled), null);
  // Format conflicts affect only the contradictory dimension, not unrelated format/context details.
  const projection = merged.projection.filter(value => !alternatives.some(other => modalityConflict(
    { ...emptyModality(), projection: [value] }, { ...emptyModality(), projection: other.projection })));
  return { ...merged,
    version: unique(alternatives.map(value => value.version), 'unknown'),
    spokenLanguage: unique(alternatives.map(value => value.spokenLanguage), null),
    subtitleLanguage: subtitled === true ? unique(alternatives.map(value => value.subtitleLanguage), null) : null,
    subtitled, projection,
    edition: unique(alternatives.map(value => value.edition), null),
  };
}

export async function resolveScreenings(store: PipelineStore, _engine: DecisionEngine, inputs: ScreeningInput[]): Promise<PublishedScreening[]> {
  const previousReviews = new Set(store.issues().filter(issue => issue.type === 'screening-conflict').map(issue => issue.subject));
  const slots = new Map<string, ScreeningInput[]>();
  for (const input of inputs) {
    const key = [input.filmId, input.venueId, input.observation.data.date, input.observation.data.time].join('|');
    const group = slots.get(key) ?? []; group.push(input); slots.set(key, group);
  }
  const output: PublishedScreening[] = [];
  for (const [key, group] of [...slots.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const subject = `slot:${identity('screening', key)}`;
    const evidence = fingerprint(group.map(input => ({ subject: input.observation.subject, data: input.observation.data, modality: input.modality })));
    const correction = store.overrides(subject).filter(o => o.action === 'patch').slice(-1)[0];
    const alternatives = [...new Map(group.map(item => [fingerprint(item.modality), item.modality])).values()];
    const conflicting = alternatives.some((a, i) => alternatives.some((b, j) => j > i && modalityConflict(a, b)));
    let chosen = agreedModality(alternatives);
    if (correction?.patch?.screening?.modality) {
      if (correction.evidenceFingerprint === evidence) {
        chosen = correction.patch.screening.modality;
      } else {
        flag(store, 'correction-conflict', subject, 'New screening evidence needs review',
          { correction, observations: group.map(g => g.observation) }, 'open', 100, evidence);
      }
    }
    if (previousReviews.has(subject)) {
      flag(store, 'screening-conflict', subject, `Automatically combined screening: ${group[0].cinema} · ${group[0].observation.data.date} ${group[0].observation.data.time}`,
        { evidence, observations: group.map(g => g.observation), alternatives, resolutionCode: 'same-viewing',
          resolution: 'The same film, cinema, date and time identify one viewing. Source descriptions are retained; contradictory details are left unspecified.' }, 'caution', 50, evidence);
    }
    output.push({
      id: identity('screening', key), date: group[0].observation.data.date, time: group[0].observation.data.time,
      cinema: group[0].cinema, venueId: group[0].venueId, variants: modalityTags(chosen),
      modality: chosen, edition: chosen.edition, uncertain: false, stale: group.every(r => r.stale),
      sourceUrls: [...new Set(group.map(r => r.observation.data.url).filter(Boolean))], observationIds: group.map(r => r.observation.id),
      lastObservedAt: group.map(r => r.observation.observedAt).sort().slice(-1)[0],
      ...(conflicting ? { alternatives } : {}),
    });
  }
  return output;
}
