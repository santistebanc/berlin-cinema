import { DecisionEngine } from './decision-model';
import { DecisionRequest, Entity, Observation, ParsedLabel, emptyModality, fingerprint, identity, normalize } from './domain';
import { combineModality, parseLabel, programmeRule, sourceTitleKey } from './labels';
import { PipelineStore } from './store';
import { OsmAddress, OsmCinema } from '../osm-client';
import { parseVenueAddress, venueAddressesMatch, venueAddressTypoCompatible } from './addresses';
import { GeoCandidate, GeoLookup, VenueGeocoder } from './geocoding';
import { CachedFilmEvidence, creditNames, filmMetadataInput, supportsFilmIdentity } from './identity-evidence';
import { providerDerived, independentObservations } from './lineage';

export function linkEvidence(observation: Observation): string {
  const d = observation.data;
  return fingerprint(observation.kind === 'venue' ? { name: d.name, address: d.address, url: d.url }
    : { rawTitle: d.rawTitle, displayTitle: d.displayTitle, year: d.year, director: d.director, url: d.url });
}
export function similarity(a: string, b: string): number {
  const ignored = new Set(['the', 'a', 'an', 'of', 'and', 'der', 'die', 'das', 'ein', 'eine', 'und', 'im', 'in', 'am', 'for', 'to']);
  const words = (value: string) => {
    const tokens = normalize(value).split(' ').filter(Boolean); const significant = tokens.filter(token => !ignored.has(token));
    return significant.length ? significant : tokens;
  };
  const left = new Set(words(a)); const right = new Set(words(b));
  return left.size && right.size ? [...left].filter(t => right.has(t)).length / new Set([...left, ...right]).size : 0;
}
export function identityConflict(a: any, b: any): boolean {
  const directors = (value: any) => creditNames(value.directors?.length ? value.directors : value.director);
  const leftDirectors = directors(a); const rightDirectors = directors(b);
  const creditedDirector = leftDirectors.some((person: string) => rightDirectors.includes(person));
  return !!(a.verifiedImdbId && b.verifiedImdbId && a.verifiedImdbId !== b.verifiedImdbId)
    || !!(a.tmdbId && b.tmdbId && a.tmdbId !== b.tmdbId)
    || !!(a.year && b.year && Math.abs(Number(a.year) - Number(b.year)) > 1)
    || !!(leftDirectors.length && rightDirectors.length && !creditedDirector);
}
export function venueAddressConflict(left: string, right: string): boolean {
  const a = parseVenueAddress(left); const b = parseVenueAddress(right);
  return !!a && !!b && !venueAddressesMatch(left, right);
}
export function flag(store: PipelineStore, type: string, subject: string, title: string, details: Record<string, any>,
  status: 'open' | 'caution' = 'open', priority = 50, evidence?: string) {
  return store.issue({ type, subject, title, details, status, priority, fingerprint: evidence ?? fingerprint(details) });
}

/** Product fallback for exact generic labels after successful credit checks, never an identity merge. */
function genericListingClassification(store: PipelineStore, observation: Observation, parsed: ParsedLabel): 'film-credits' | 'generic-source-programme' | null {
  if (!/^(?:festival|film\s*festival|sonderprogramm)$/i.test(parsed.title)) return null;
  const sources = store.observations(undefined, true).filter(item => item.kind === 'listing'
    && (observation.data.url && item.data.url === observation.data.url || normalize(parseLabel(item.data.rawTitle || item.data.title).title) === normalize(parsed.title)));
  if (!sources.some(item => item.subject === observation.subject)) sources.push(observation);
  const hasCredits = (data: any) => creditNames(data.directors?.length ? data.directors : data.director).length > 0 || creditNames(data.cast).length > 0;
  if (sources.some(item => hasCredits(item.data))) return 'film-credits';
  for (const item of sources) {
    const linked = store.link(item.subject); const entity = linked && store.entity(linked.entityId);
    if (entity && (entity.data.tmdbId || hasCredits(entity.data)
      || store.fields(entity.id).some(field => field.identityVerified && ['director', 'directors', 'cast'].includes(field.field) && creditNames(field.value).length))) return 'film-credits';
  }
  if (sources.every(item => !item.data.year && !parseLabel(item.data.rawTitle || item.data.title).year
    && item.data.sourceDetails?.url === item.data.url && item.data.sourceDetails.creditsChecked === true && !item.data.sourceDetails.failed
    && Date.parse(item.observedAt) - Date.parse(item.data.sourceDetails.fetchedAt) <= 7 * 86400000)) return 'generic-source-programme';
  return null;
}

export async function interpret(store: PipelineStore, engine: DecisionEngine, observation: Observation): Promise<ParsedLabel> {
  const raw = observation.data;
  let parsed = parseLabel(raw.rawTitle || raw.title, raw.variants ?? []);
  if (raw.displayTitle) {
    const display = parseLabel(raw.displayTitle);
    // Display labels often carry language markers; never copy their unclassified fragments into modalities.
    parsed.modality = combineModality(parsed.modality, display.modality);
    if (normalize(display.title) !== normalize(parsed.title)) parsed.alternateTitles.push(display.title);
  }
  parsed.year ??= raw.year && Number.isFinite(Number(raw.year)) ? Number(raw.year) : null;
  if (raw.isSpecial === true) parsed.kind = 'programme';
  if (raw.altTitle && normalize(raw.altTitle) !== normalize(parsed.title)) parsed.alternateTitles.push(raw.altTitle);
  if (raw.originalTitle && normalize(raw.originalTitle) !== normalize(parsed.title)) parsed.alternateTitles.push(raw.originalTitle);
  // Two explicit labels on this source record can corroborate a retained title qualifier.
  // Preserve its text; do not invent a translation, language, edition or projection from it.
  if (raw.altTitle && raw.displayTitle && normalize(parseLabel(raw.altTitle).title) === normalize(parseLabel(raw.displayTitle).title)) {
    parsed.ambiguous = parsed.ambiguous.filter(segment => {
      const without = parsed.title.replace(`(${segment})`, '').trim();
      const markerLike = /\b(?:subtitles?|untertitel\w*|dubbed|synchron\w*|fassung|screenx|atmos|cut|version|restor\w*|[23]d|imax|ov|omu)\b/i.test(segment);
      return markerLike || normalize(without) !== normalize(parseLabel(raw.altTitle).title);
    });
  }
  const correction = store.overrides(observation.subject).filter(o => o.action === 'patch').slice(-1)[0];
  if (correction?.patch?.parsed) {
    if (correction.evidenceFingerprint === linkEvidence(observation)) return { ...parsed, ...correction.patch.parsed };
    flag(store, 'correction-conflict', observation.subject, `New evidence contradicts a parsing correction: ${parsed.title}`,
      { observation, correction }, 'open', 95, linkEvidence(observation));
  }
  if (parsed.ambiguous.length) {
    // Every possible output string is already present in the source. A decision model never invents a title.
    const choices = {
      title: 'An integral part of the title; retain it', alternate_title: 'A translated or alternate title explicitly supplied here',
      original: 'An explicit original-version marker, with no subtitle information',
      original_subtitles: 'Original version with subtitles; subtitle language unspecified',
      original_subtitles_en: 'Original version explicitly subtitled in English',
      original_subtitles_de: 'Original version explicitly subtitled in German',
      dubbed_de: 'An explicitly German-dubbed version', dubbed_de_subtitles_en: 'German dubbed version explicitly subtitled in English',
      projection: 'A projection/technical format, such as ScreenX; retain the supplied text as a projection label',
      edition: 'An edition/cut/restoration; retain the supplied text as its edition label',
      context: 'An event annotation, such as a Q&A; retain the supplied text as event context',
      insufficient: 'Cannot determine the role or this combines several roles that cannot safely be separated',
    };
    const segments = parsed.ambiguous.slice(0, 12);
    const request: DecisionRequest = { task: 'parse', state: { source: observation.source, raw, parsed },
      questions: Object.fromEntries(segments.map((segment, i) => [`segment_${i}`, {
        instructions: `Classify exactly this source segment: ${JSON.stringify(segment)}. Identify only explicit markers. Generic OmU does not specify a subtitle language. Film origin does not establish screening language.`, choices,
      }])) };
    const result = await engine.decide(request);
    if (result.accepted) for (const [index, segment] of segments.entries()) {
      const choice = result.response?.answers[`segment_${index}`].choice;
      if (!choice || choice === 'insufficient') continue;
      parsed.ambiguous = parsed.ambiguous.filter(value => value !== segment);
      if (choice === 'title') continue;
      const replacement = parsed.title.replace(`(${segment})`, '').replace(/\s+/g, ' ').trim();
      if (!replacement) continue;
      parsed.title = replacement;
      parsed.modality.unknown = parsed.modality.unknown.filter(value => normalize(value) !== normalize(segment));
      if (choice === 'alternate_title') parsed.alternateTitles.push(segment);
      else {
        const marker = emptyModality();
        if (choice.startsWith('original')) marker.version = 'original';
        if (choice.includes('subtitles')) marker.subtitled = true;
        if (choice.endsWith('_en')) marker.subtitleLanguage = 'en';
        if (choice === 'original_subtitles_de') marker.subtitleLanguage = 'de';
        if (choice.startsWith('dubbed_de')) { marker.version = 'dubbed'; marker.spokenLanguage = 'de'; }
        if (choice === 'projection') marker.projection = [segment];
        if (choice === 'edition') marker.edition = segment;
        if (choice === 'context') marker.context = [segment];
        parsed.modality = combineModality(parsed.modality, marker);
      }
    }
    flag(store, 'label-interpretation', observation.subject, `Interpret source label: ${raw.rawTitle || raw.title}`,
      { observation, parsed, decision: result, choices }, parsed.ambiguous.length ? 'open' : 'caution', 45, linkEvidence(observation));
  } else if (store.issues().some(issue => issue.type === 'label-interpretation' && issue.subject === observation.subject)) {
    flag(store, 'label-interpretation', observation.subject, `Source label interpreted by rules: ${raw.rawTitle || raw.title}`,
      { observation, parsed, resolutionCode: 'explicit-label-rules',
        resolution: 'Recognized markers were extracted; grammatical parentheses and corroborated title qualifiers were retained without inferring screening properties.' }, 'caution', 40, linkEvidence(observation));
  }
  if (parsed.modality.unknown.length) flag(store, 'unknown-marker', observation.subject, `Unrecognized annotation: ${parsed.title}`,
    { observation, parsed, unknown: parsed.modality.unknown }, 'open', 40, linkEvidence(observation));
  const generic = genericListingClassification(store, observation, parsed);
  if (generic === 'film-credits') parsed.kind = 'film';
  const rule = programmeRule(parsed.title) ?? (generic === 'generic-source-programme' ? generic : null);
  if (parsed.kind === 'programme' && !rule) {
    const result = await engine.decide({ task: 'parse', state: { observation, parsed }, questions: {
      kind: { instructions: 'Classify the listing as a feature film or a programme/performance (such as an opera production, shorts programme, festival or unknown sneak preview). A word in a title alone does not establish the listing type.',
        choices: { film: 'An identifiable individual film', programme: 'A programme, performance, event or unidentified sneak preview', insufficient: 'Cannot determine the listing type' } },
    } });
    const kind = result.response?.answers.kind.choice;
    if (result.accepted && (kind === 'film' || kind === 'programme')) parsed.kind = kind;
    flag(store, 'listing-kind', observation.subject, `Review programme/film classification: ${parsed.title}`,
      { observation, parsed, decision: result }, result.accepted && kind !== 'insufficient' ? 'caution' : 'open', 60, linkEvidence(observation));
  } else if (rule && store.issues().some(issue => issue.type === 'listing-kind' && issue.subject === observation.subject)) {
    flag(store, 'listing-kind', observation.subject, rule === 'generic-source-programme' ? `Special programme fallback: ${parsed.title}` : `Programme classified from explicit label: ${parsed.title}`,
      { observation, parsed, resolutionCode: rule, resolution: rule === 'generic-source-programme'
        ? 'Successful detail checks on the available source records found no director, cast or year. This exact generic label is displayed as a special programme; the fallback is re-evaluated when evidence changes.'
        : 'An explicit programme label establishes the listing type. Constituent films are not inferred.' }, 'caution', 40, linkEvidence(observation));
  } else if (parsed.kind === 'film' && store.issues().some(issue => issue.type === 'listing-kind' && issue.subject === observation.subject)) {
    flag(store, 'listing-kind', observation.subject, `Film classification retained: ${parsed.title}`,
      { observation, parsed, resolutionCode: 'bounded-listing-kind', resolution: 'Programme hints match complete words and explicit labels; substrings inside ordinary film titles do not establish a programme.' }, 'caution', 40, linkEvidence(observation));
  }
  return parsed;
}

export class IdentityResolver {
  private apiEvidence: CachedFilmEvidence;
  private sourceAliases = new Map<string, any[]>();
  private publishedIdentities: Set<string>[] = [];
  private now: string;
  constructor(private store: PipelineStore, private engine: DecisionEngine, private osm: OsmCinema[] = [], private osmAddresses: OsmAddress[] = [], private geocoder?: VenueGeocoder,
    now?: string) {
    this.now = now ?? new Date().toISOString(); this.apiEvidence = new CachedFilmEvidence(store, this.now);
    const identities = new Map<string, Set<string>>();
    for (const movie of store.snapshot()?.movies ?? []) {
      identities.set(`film:${movie.id}`, new Set([movie.id, ...(movie.sourceAliases ?? []).map((alias: any) => alias.entityId)].filter((id): id is string => typeof id === 'string')));
      for (const cinema of movie.cinemas ?? []) identities.set(`venue:${cinema.id}`,
        new Set([cinema.id, ...(cinema.sourceAliases ?? []).map((alias: any) => alias.entityId)].filter((id): id is string => typeof id === 'string')));
      for (const [kind, aliases] of [[movie.kind, movie.sourceAliases ?? []],
        ['venue', (movie.cinemas ?? []).flatMap((cinema: any) => cinema.sourceAliases ?? [])]] as [string, any[]][]) {
        for (const alias of aliases) {
          if (!alias.entityId || !alias.evidenceFingerprint) continue;
          const key = `${kind}:${alias.subject}`; const known = this.sourceAliases.get(key) ?? [];
          if (!known.some(item => item.entityId === alias.entityId && item.evidenceFingerprint === alias.evidenceFingerprint)) known.push(alias);
          this.sourceAliases.set(key, known);
        }
      }
    }
    for (const resource of store.resources('source-alias:')) {
      const alias = resource.data;
      if (alias.kind && alias.subject && alias.entityId && alias.evidenceFingerprint)
        this.sourceAliases.set(`${alias.kind}:${alias.subject}`, [alias]);
    }
    for (const resource of store.resources('published-identity:')) {
      const value = resource.data;
      identities.set(resource.key, new Set([value.memberId, value.entityId, value.publicId].filter((id): id is string => typeof id === 'string')));
    }
    this.publishedIdentities = [...identities.values()];
  }

  private publishedSource(observation: Observation, kind: Entity['kind']): Entity | null {
    const excluded = this.excluded(observation);
    const canonical = (id: string): string | null => {
      const seen = new Set<string>();
      while (!seen.has(id)) {
        if (excluded.has(id)) return null;
        seen.add(id);
        const next = this.store.resource(`published-identity:${kind}:${id}`)?.data.entityId;
        if (!next || next === id) return id;
        id = next;
      }
      return null;
    };
    const ids = [...new Set<string>((this.sourceAliases.get(`${kind}:${observation.subject}`) ?? []).filter(alias => alias.source === observation.source
      && alias.evidenceFingerprint === linkEvidence(observation)).map(alias => canonical(alias.entityId)).filter((id): id is string => !!id))];
    if (ids.length !== 1) return null;
    const entity = this.store.entity(ids[0]);
    return entity?.kind === kind && !entity.data.redirectTo && !entity.data.retired ? entity : null;
  }

  private manual(observation: Observation, kind: Entity['kind']): Entity | null | 'conflict' {
    const correction = this.store.overrides(observation.subject).filter(o => o.action === 'link').slice(-1)[0];
    if (!correction) return null;
    const entity = this.store.entity(correction.targetId!);
    const venueFields = entity?.kind === 'venue' ? Object.assign({}, entity.data,
      ...this.store.overrides(`entity:${entity.id}`).filter(o => o.action === 'patch').map(o => o.patch?.fields ?? {})) : null;
    const confirmsVenue = entity?.kind === 'venue' && normalize(entity.name) === normalize(observation.data.name)
      && venueAddressesMatch(observation.data.address, venueFields?.address || '');
    if (!entity || entity.kind !== kind || (correction.evidenceFingerprint !== linkEvidence(observation) && !confirmsVenue)) {
      flag(this.store, 'correction-conflict', observation.subject, 'Changed source evidence needs a manual identity check',
        { observation, correction, candidate: entity }, 'open', 100, linkEvidence(observation)); return 'conflict';
    }
    this.store.saveLink(observation.subject, entity.id, linkEvidence(observation), 'manual'); return entity;
  }
  private excluded(observation: Observation): Set<string> {
    const excluded = new Set(this.store.overrides(observation.subject).filter(o => o.action === 'separate').map(o => o.targetId!).filter(Boolean));
    if (excluded.size) for (const ids of this.publishedIdentities) if ([...ids].some(id => excluded.has(id))) for (const id of ids) excluded.add(id);
    return excluded;
  }
  private bind(observation: Observation, entity: Entity, method: string): Entity {
    this.store.saveEntity(entity); this.store.saveLink(observation.subject, entity.id, linkEvidence(observation), method); return entity;
  }
  async film(observation: Observation, parsed: ParsedLabel): Promise<Entity> {
    const manual = this.manual(observation, parsed.kind);
    if (manual && manual !== 'conflict') return manual;
    const evidence = { title: parsed.title, titles: parsed.alternateTitles, year: parsed.year, director: observation.data.director ?? null,
      cast: observation.data.cast ?? [], verifiedImdbId: observation.data.verifiedImdbId, tmdbId: observation.data.verifiedTmdbId };
    const published = !manual && this.publishedSource(observation, parsed.kind);
    if (published && !identityConflict(evidence, published.data)) {
      const extended = this.extend(published, observation, parsed);
      // The known alias adds names/URLs, not new assumptions to the canonical
      // profile that independently established the accepted external identity.
      extended.data.year = published.data.year; extended.data.director = published.data.director;
      if (published.data.tmdbId && published.data.metadataEvidence === fingerprint(filmMetadataInput(published)))
        extended.data.metadataEvidence = fingerprint(filmMetadataInput(extended));
      return this.bind(observation, extended, 'source-alias');
    }
    const apiIdentity = observation.provenance?.upstreamLineage.length && !providerDerived(observation, 'tmdb') ? this.apiEvidence.match(evidence) : null;
    const old = this.store.link(observation.subject);
    const excluded = this.excluded(observation);
    let existing = old && !excluded.has(old.entityId) ? this.store.entity(old.entityId) : null;
    const sameSourceRecord = existing && observation.data.url && existing.data.sourceUrls?.includes(observation.data.url)
      && [existing.name, ...(existing.data.titles ?? [])].some(title => normalize(sourceTitleKey(title)) === normalize(sourceTitleKey(parsed.title)));
    const priorApiIdentity = sameSourceRecord && existing ? this.apiEvidence.match({ ...existing.data, title: existing.name }) : null;
    if (!manual && sameSourceRecord && existing?.kind === 'film' && parsed.kind === 'film' && !existing.data.redirectTo
      && priorApiIdentity && evidence.year && existing.data.year
      && Math.abs(Number(evidence.year) - Number(existing.data.year)) > 1
      && !identityConflict({ ...evidence, year: null }, existing.data)
      && creditNames(evidence.director).length && creditNames(evidence.cast).length >= 2
      && this.apiEvidence.match({ ...evidence, year: null })?.id === priorApiIdentity.id) {
      flag(this.store, 'source-identity-changed', observation.subject, `Source year differs; film identity revalidated: ${parsed.title}`,
        { observation, previous: existing, parsed, apiEvidence: priorApiIdentity, resolutionCode: 'stable-source-provider-credits',
          resolution: 'The established source URL and full title are unchanged. The previous profile and current director/cast independently validate the same provider ID despite a year-only discrepancy. The source year is retained as conflicting evidence, not reinterpreted as a production or re-release year.' },
        'caution', 55, linkEvidence(observation));
      return this.bind(observation, this.extend(existing, observation, parsed), 'source-evidence');
    }
    // Repair an obsolete automatic programme hint without replacing the source identity/public slug.
    // Accepted model/manual classifications and external identities are deliberately excluded.
    if (!manual && (old?.evidence === linkEvidence(observation) || existing?.data.programmeFallback === true) && existing?.kind === 'programme' && parsed.kind === 'film'
      && ['source-evidence', 'provisional', 'source-alias'].includes(old.method) && !existing.data.tmdbId
      && !identityConflict(evidence, existing.data)
      && normalize(existing.name) === normalize(parsed.title) && (parseLabel(existing.name).kind === 'film' || existing.data.programmeFallback === true)
      && existing.data.sourceUrls?.includes(observation.data.url)) {
      const linked = this.store.linkedObservations(existing.id);
      const subjects = new Set(linked.map(item => item.subject));
      const corrected = this.store.overrides(`entity:${existing.id}`).length || linked.some(item => this.store.overrides(item.subject).length)
        || this.store.issues().some(issue => issue.type === 'listing-kind' && subjects.has(issue.subject) && issue.details.decision?.accepted);
      if (!corrected) return this.bind(observation, this.extend({ ...existing, kind: 'film' }, observation, parsed), 'source-evidence');
    }
    const stableSourceRecord = existing && ['provisional', 'source-evidence', 'source-continuity', 'source-alias'].includes(old?.method ?? '')
      && sameSourceRecord
      && this.groupCompatible(existing, evidence);
    if (!manual && ((old?.method !== 'provisional' || existing?.data.tmdbId) && old?.evidence === linkEvidence(observation) || stableSourceRecord) && existing
      && existing.kind === parsed.kind && !identityConflict(evidence, existing.data) && !existing.data.redirectTo
      && (old.method !== 'decision' || supportsFilmIdentity(evidence, existing.data)))
      return this.bind(observation, this.extend(existing, observation, parsed), old.method);
    if (existing && identityConflict(evidence, existing.data)) {
      flag(this.store, 'source-identity-changed', observation.subject, `Source identity changed: ${parsed.title}`,
        { observation, previous: existing, parsed }, 'open', 95, linkEvidence(observation));
    }
    const candidates = this.store.entities(parsed.kind).filter(entity => !entity.data.redirectTo && !entity.data.retired && !excluded.has(entity.id)
      && entity.id !== old?.entityId
      && !identityConflict(evidence, entity.data))
      .map(entity => ({ entity, score: observation.data.url && entity.data.sourceUrls?.includes(observation.data.url) ? 1 : Math.max(...[entity.name, ...(entity.data.titles ?? [])]
        .flatMap(title => [parsed.title, ...parsed.alternateTitles].map(label => similarity(title, label)))) }))
      .filter(item => item.score >= 0.2)
      .map(({ entity, score }) => {
        const sources = this.store.linkedObservations(entity.id).filter(item => item.kind === 'listing');
        const profile = { ...entity.data, title: entity.name, cast: [...(entity.data.cast ?? []), ...sources.flatMap(item => item.data.cast ?? [])] };
        const candidateApi = sources.some(item => item.provenance?.upstreamLineage.length && !providerDerived(item, 'tmdb'))
          ? this.apiEvidence.match(profile) : null;
        const independentlySupported = sources.some(other => independentObservations(observation, other)
          && supportsFilmIdentity(evidence, other.data));
        return { entity, profile, apiIdentity: candidateApi, independentlySupported, score };
      })
      .filter(item => !(apiIdentity && item.apiIdentity && apiIdentity.id !== item.apiIdentity.id))
      .filter(item => item.score === 1 || supportsFilmIdentity(evidence, item.profile)
        || apiIdentity && item.apiIdentity?.id === apiIdentity.id)
      .sort((a, b) => b.score - a.score).slice(0, 10);
    const titleKeys = [parsed.title, ...parsed.alternateTitles].map(title => normalize(sourceTitleKey(title)));
    const continuity = candidates.filter(({ entity }) => entity.id !== existing?.id && observation.data.url && entity.data.sourceUrls?.includes(observation.data.url)
      && [entity.name, ...(entity.data.titles ?? [])].some(title => titleKeys.includes(normalize(sourceTitleKey(title))))
      && this.store.linkedObservations(entity.id).some(other => other.source === observation.source && other.data.url === observation.data.url)
      && this.groupCompatible(entity, evidence));
    if (!manual && continuity.length === 1 && (!existing || existing.kind !== parsed.kind
      || !identityConflict(existing.data, continuity[0].entity.data)
        && !(existing.data.tmdbId && continuity[0].entity.data.tmdbId && existing.data.tmdbId !== continuity[0].entity.data.tmdbId))
      && (!existing || this.groupCompatible(existing, evidence))) {
      // Keep the current public ID/slug when a parser change already created a provisional duplicate.
      // The historical source record is corroboration, not a reason to merge unrelated title matches.
      let target = existing?.kind === parsed.kind ? existing : continuity[0].entity;
      if (target.data.nameSubject && !this.store.observations(undefined, true).some(item => item.subject === target.data.nameSubject))
        target = { ...target, data: { ...target.data, nameSubject: observation.subject } };
      if (this.store.issues().some(issue => issue.type === 'film-match' && issue.subject === observation.subject))
        flag(this.store, 'film-match', observation.subject, `Source record retained: ${parsed.title}`,
          { observation, parsed, candidates: continuity.map(item => item.entity), targetId: target.id,
            resolutionCode: 'source-record-continuity', resolution: 'The source URL, compatible identity evidence and bounded title variants establish continuity with the historical source record.' }, 'caution', 40, linkEvidence(observation));
      return this.bind(observation, this.extend(target, observation, parsed), 'source-continuity');
    }
    const exact = candidates.filter(({ entity, independentlySupported, apiIdentity: candidateApi }) => [entity.name, ...(entity.data.titles ?? [])].some(t => normalize(t) === normalize(parsed.title))
      && this.groupCompatible(entity, evidence)
      && ((observation.data.url && entity.data.sourceUrls?.includes(observation.data.url))
        || independentlySupported || apiIdentity && candidateApi?.id === apiIdentity.id));
    if (!manual && exact.length === 1) {
      if (this.store.issues().some(issue => issue.type === 'film-match' && issue.subject === observation.subject))
        flag(this.store, 'film-match', observation.subject, `Film identity corroborated: ${parsed.title}`,
          { observation, parsed, candidates: exact.map(item => item.entity), targetId: exact[0].entity.id,
            apiEvidence: { current: apiIdentity, candidate: exact[0].apiIdentity }, resolutionCode: 'corroborated-film-identity',
            resolution: 'A stable source record, compatible independent credits/years or independently validated provider identities established this match. Name overlap alone was insufficient.' }, 'caution', 40, linkEvidence(observation));
      return this.bind(observation, this.extend(exact[0].entity, observation, parsed), 'source-evidence');
    }
    if (!manual && candidates.length && !(parsed.kind === 'programme' && (programmeRule(parsed.title)
      || genericListingClassification(this.store, observation, parsed) === 'generic-source-programme'))) {
      const result = await this.engine.decide({ task: 'film', state: { observation, parsed,
        candidates: candidates.map(c => c.entity) }, questions: { identity: { instructions:
        'Which candidate is the same film/programme as this listing? Similar names, matching dates or missing years alone do not establish identity. Remakes and different opera productions are distinct.',
      choices: { ...Object.fromEntries(candidates.map(c => [c.entity.id, JSON.stringify(c.entity)])),
        different: 'A distinct film/programme; none of the candidates is the same work', insufficient: 'Evidence cannot establish identity' } } } });
      const chosen = candidates.find(c => c.entity.id === result.response?.answers.identity.choice)?.entity;
      if (result.accepted && chosen && this.groupCompatible(chosen, evidence)
        && candidates.find(item => item.entity.id === chosen.id)!.independentlySupported) {
        flag(this.store, 'film-match', observation.subject, `Model resolved film identity: ${parsed.title}`,
          { observation, parsed, candidates: candidates.map(c => c.entity), decision: result, targetId: chosen.id }, 'caution', 55, linkEvidence(observation));
        return this.bind(observation, this.extend(chosen, observation, parsed), 'decision');
      }
      if (!(result.accepted && result.response?.answers.identity.choice === 'different')) {
        flag(this.store, 'film-match', observation.subject, `Resolve film identity: ${parsed.title}`,
          { observation, parsed, candidates: candidates.map(c => c.entity), decision: result }, 'open', 80, linkEvidence(observation));
      }
    }
    // Deterministic provisional identity: no title-derived global merge and no lost source record.
    const id = identity(parsed.kind, observation.subject + (manual === 'conflict' || (existing && identityConflict(evidence, existing.data)) ? linkEvidence(observation) : ''));
    const retained = existing?.id === id && existing.kind === parsed.kind && !identityConflict(evidence, existing.data) ? existing
      : { id, kind: parsed.kind, name: parsed.title, data: {} };
    return this.bind(observation, this.extend(retained, observation, parsed), 'provisional');
  }
  private groupCompatible(entity: Entity, evidence: any): boolean {
    return !identityConflict(entity.data, evidence) && this.store.linkedObservations(entity.id)
      .filter(o => o.kind === 'listing').every(o => !identityConflict(o.data, evidence));
  }
  private extend(entity: Entity, observation: Observation, parsed: ParsedLabel): Entity {
    const ownName = !entity.data.nameSubject || entity.data.nameSubject === observation.subject;
    return { ...entity, name: ownName ? parsed.title : entity.name, data: { ...entity.data, nameSubject: entity.data.nameSubject || observation.subject,
      year: entity.data.year || parsed.year, director: entity.data.director || observation.data.director || null,
      originalTitle: observation.data.originalTitle || entity.data.originalTitle || null,
      cast: [...new Set([...(entity.data.cast ?? []), ...(observation.data.cast ?? [])])],
      programmeFallback: parsed.kind === 'programme' && genericListingClassification(this.store, observation, parsed) === 'generic-source-programme',
      titles: [...new Set([entity.name, ...(entity.data.titles ?? []), parsed.title, ...parsed.alternateTitles])],
      sourceUrls: [...new Set([...(entity.data.sourceUrls ?? []), observation.data.url].filter(Boolean))] } };
  }
  async venue(observation: Observation): Promise<Entity> {
    const manual = this.manual(observation, 'venue');
    if (manual && manual !== 'conflict') return manual;
    const published = !manual && this.publishedSource(observation, 'venue');
    if (published && published.data.insideBerlin === true && (published.data.osmId
      || Date.parse(this.now) - Date.parse(published.data.locationEvidence?.fetchedAt) <= 90 * 86400000))
      return this.bind(observation, published, 'source-alias');
    const excluded = this.excluded(observation);
    const previous = this.store.link(observation.subject); const known = previous && !excluded.has(previous.entityId) ? this.store.entity(previous.entityId) : null;
    const { name, address } = observation.data;
    const addressEvidence = this.store.observations(undefined, true).filter(other => other.kind === 'venue'
      && independentObservations(observation, other) && normalize(other.data.name) === normalize(name)
      && Math.abs(Date.parse(other.observedAt) - Date.parse(observation.observedAt)) <= 86400000
      && venueAddressTypoCompatible(address, other.data.address))
      .map(other => ({ subject: other.subject, source: other.source, address: other.data.address }));
    const corroboration = addressEvidence.length ? { corroboratingAddresses: addressEvidence } : {};
    const changedAddress = known && venueAddressConflict(address, known.data.address);
    const previousAddressReview = this.store.issues().find(issue => issue.type === 'venue-identity-changed' && issue.subject === observation.subject);
    const nameLookupNeeded = !!changedAddress || !!previousAddressReview && known?.data.locationEvidence?.identityEstablished !== true;
    if (!manual && previous?.evidence === linkEvidence(observation) && known && !known.data.redirectTo
      && !nameLookupNeeded && (known.data.osmId || !this.geocoder && known.data.insideBerlin)
      && (!['decision', 'venue-evidence'].includes(previous.method) || venueAddressesMatch(address, known.data.address || ''))) return known;
    const sourceAddress = parseVenueAddress(address);
    const verifiedAddresses = [...this.osm, ...this.osmAddresses].filter(item => item.insideBerlin === true
      && (!sourceAddress?.city || sourceAddress.city === 'berlin') && venueAddressesMatch(address, item.address || ''));
    const location = verifiedAddresses[0];
    const existing = this.store.entities('venue').filter(e => !e.data.redirectTo && !excluded.has(e.id));
    const osm = this.osm.map(cinema => ({ id: identity('venue', `osm:${cinema.id || normalize(cinema.name) + cinema.address}`),
      kind: 'venue' as const, name: cinema.name, data: { address: cinema.address, websiteUrl: cinema.website,
        osmId: cinema.id, insideBerlin: cinema.insideBerlin === true, latitude: cinema.latitude, longitude: cinema.longitude,
        aliases: cinema.aliases, city: cinema.city, postalCode: cinema.postalCode, district: cinema.district,
        phone: cinema.phone, openingHours: cinema.openingHours, wheelchair: cinema.wheelchair } }));
    const all = [...new Map([...osm, ...existing].map(e => [e.id, e])).values()]
      .filter(entity => !excluded.has(entity.id) && !venueAddressConflict(address, entity.data.address));
    const candidates = all.map(entity => ({ entity, score: similarity(name, entity.name) }))
      .filter(c => c.score >= 0.15 || (address && c.entity.data.address && normalize(address).includes(normalize(c.entity.data.address))))
      .sort((a, b) => b.score - a.score).slice(0, 12);
    const exact = candidates.filter(c => c.entity.data.insideBerlin && [c.entity.name, ...(c.entity.data.aliases ?? [])].some(label => normalize(label) === normalize(name))
      && venueAddressesMatch(address, c.entity.data.address || ''));
    const withLocation = (entity: Entity): Entity => !location ? entity : { ...entity, data: { ...entity.data,
      address, insideBerlin: true, latitude: location.latitude, longitude: location.longitude,
      locationEvidence: { source: 'OpenStreetMap', method: 'exact-source-address', sourceAddress: address,
        matches: verifiedAddresses.map(item => ({ osmId: item.id, address: item.address })) } } };
    if (!manual && !nameLookupNeeded && exact.length === 1 && (!this.geocoder || exact[0].entity.data.osmId || location)) return this.bind(observation, withLocation(exact[0].entity), location ? 'venue-address-evidence' : 'venue-evidence');
    let geocoding: GeoLookup | undefined;
    const geoEntity = (candidate: GeoCandidate): Entity => ({ id: identity('venue', `geoapify:${candidate.placeId}`), kind: 'venue', name: candidate.nameMatches ? name : candidate.name || name,
      data: { address: candidate.address, insideBerlin: candidate.insideBerlin, latitude: candidate.latitude, longitude: candidate.longitude,
        geoapifyPlaceId: candidate.placeId, websiteUrl: candidate.websiteUrl, suburb: candidate.suburb,
        city: candidate.city, postalCode: candidate.postalCode, aliases: candidate.aliases, phone: candidate.phone,
        openingHours: candidate.openingHours, wheelchair: candidate.wheelchair, externalIds: candidate.externalIds,
        locationEvidence: { source: 'Geoapify', method: 'place-search-and-administrative-boundary', fetchedAt: geocoding?.fetchedAt,
          confidence: candidate.confidence, buildingConfidence: candidate.buildingConfidence, boundary: candidate.boundary } } });
    if (!manual && this.geocoder && (!location || nameLookupNeeded)) {
      // A changed source address can identify a perfectly real building belonging to the wrong venue.
      // Resolve the cinema by name first and let its verified API address supersede the source label.
      geocoding = await this.geocoder.lookup(nameLookupNeeded
        ? { name, explicitCity: observation.data.explicitCity || sourceAddress?.city,
          ...(addressEvidence.length ? { address, search: 'name' as const, ...corroboration } : {}) }
        : { ...observation.data, name, address, ...corroboration });
      if (!nameLookupNeeded && address && ['low-confidence', 'ambiguous', 'not-found'].includes(geocoding.status)) {
        const addressAttempt = { status: geocoding.status, reason: geocoding.reason, query: geocoding.query };
        const named = await this.geocoder.lookup({ name, address, explicitCity: observation.data.explicitCity || sourceAddress?.city, search: 'name', ...corroboration });
        geocoding = { ...named, addressAttempt };
      }
      if (geocoding.status === 'resolved' && geocoding.selected) {
        const selected = geocoding.selected;
        const compatible = existing.filter(entity => normalize(entity.name) === normalize(name) && venueAddressesMatch(selected.address, entity.data.address || ''));
        const cinemaIdentity = selected.category === 'entertainment.cinema' && selected.nameMatches;
        const compatibleTarget = compatible.find(entity => entity.data.geoapifyPlaceId === selected.placeId)
          ?? compatible.sort((a, b) => a.id.localeCompare(b.id))[0];
        let target: Entity = compatibleTarget ?? (cinemaIdentity ? geoEntity(selected)
          : known && !changedAddress ? known : { id: identity('venue', observation.subject), kind: 'venue' as const, name, data: {} });
        if (excluded.has(target.id)) target = { id: identity('venue', observation.subject), kind: 'venue', name, data: {} };
        for (const issue of this.store.issues().filter(issue => issue.subject === observation.subject && issue.status === 'open'
          && ['venue-geocoding', 'venue-match', 'venue-location'].includes(issue.type))) {
          flag(this.store, issue.type, observation.subject, `Location verified automatically: ${name}`,
            { observation, entityId: target.id, targetId: target.id, geocoding, resolutionCode: 'verified-venue-address',
              resolution: `${geocoding.reason} The API address (${selected.address}) is used.` }, 'caution', 40, linkEvidence(observation));
        }
        // A later source may match a building at the same address. Keep the stronger
        // already-established cinema identity, coordinates and corroboration trail.
        if (!cinemaIdentity && target.data.locationEvidence?.identityEstablished === true
          && venueAddressesMatch(selected.address, target.data.address || '')) return this.bind(observation, target, 'geoapify-venue');
        const result = geoEntity(selected);
        const { websiteUrl, aliases, phone, openingHours, wheelchair, externalIds, ...geography } = result.data;
        if (nameLookupNeeded && previousAddressReview) flag(this.store, 'venue-identity-changed', observation.subject, `Address verified by location API: ${name}`,
          { observation, previous: previousAddressReview.details.previous || known, entityId: target.id, geocoding,
            resolutionCode: 'verified-venue-address', resolution: `The cinema was found by name in Geoapify. Its verified address (${selected.address}) is used instead of the source address.` },
          'caution', 50, linkEvidence(observation));
        return this.bind(observation, { ...target, name: target.name || name, data: { ...target.data, ...geography,
          // An address object may be a mall/cafe/building. Its identity and website never replace the cinema.
          ...(cinemaIdentity ? { aliases, phone, openingHours, wheelchair, externalIds } : {}),
          websiteUrl: cinemaIdentity ? websiteUrl || target.data.websiteUrl : target.data.websiteUrl,
          locationEvidence: { ...result.data.locationEvidence, sourceAddress: address || null, matchedAddress: selected.address,
            addressEvidence: selected.addressEvidence, identityEstablished: cinemaIdentity, reason: geocoding.reason } } }, cinemaIdentity ? 'geoapify-venue' : 'geoapify-address');
      }
      const more = geocoding.candidates.filter(candidate => candidate.category === 'entertainment.cinema').map(geoEntity)
        .filter(entity => !excluded.has(entity.id) && !venueAddressConflict(address, entity.data.address));
      for (const entity of more) if (!candidates.some(c => c.entity.id === entity.id)) candidates.push({ entity, score: similarity(name, entity.name) });
    }
    if (nameLookupNeeded) {
      const pending = { id: identity('venue', `${observation.subject}:unverified-address:${linkEvidence(observation)}`), kind: 'venue' as const,
        name, data: { address, insideBerlin: false } };
      flag(this.store, 'venue-identity-changed', observation.subject, `Verify cinema address: ${name}`,
        { observation, previous: previousAddressReview?.details.previous || known, entityId: pending.id, geocoding,
          candidates: candidates.map(candidate => candidate.entity),
          reason: 'The source address changed. A cinema-name lookup must establish the venue address; confirming only that the supplied street address exists is insufficient. Screenings are excluded until the location is verified.' },
        'open', 95, linkEvidence(observation));
      return this.bind(observation, pending, 'provisional');
    }
    if (!manual && candidates.length) {
      const result = await this.engine.decide({ task: 'venue', state: { observation, candidates: candidates.map(c => c.entity) }, questions: {
        identity: { instructions: 'Which candidate is the same physical cinema venue? Distinct branches and neighboring addresses are different venues. A shared brand or website alone is insufficient.',
          choices: { ...Object.fromEntries(candidates.map(c => [c.entity.id, JSON.stringify(c.entity)])),
            different: 'None is the same physical venue', insufficient: 'Cannot establish the physical venue' } },
      } });
      const chosen = candidates.find(c => c.entity.id === result.response?.answers.identity.choice)?.entity;
      if (result.accepted && chosen && venueAddressesMatch(address, chosen.data.address || '')
        && [chosen.name, ...(chosen.data.aliases ?? [])].some(label => normalize(label) === normalize(name))) {
        flag(this.store, 'venue-match', observation.subject, `Model resolved venue: ${name}`,
          { observation, candidates: candidates.map(c => c.entity), targetId: chosen.id, decision: result }, 'caution', 60, linkEvidence(observation));
        return this.bind(observation, withLocation(chosen), 'decision');
      }
      flag(this.store, 'venue-match', observation.subject, `Resolve venue: ${name}`,
        { observation, candidates: candidates.map(c => c.entity), decision: result }, 'open', 85, linkEvidence(observation));
    }
    const explicitBerlin = /\b\d{5}\s+Berlin\b/i.test(address || '') || observation.data.explicitCity === 'Berlin';
    const entity = { id: identity('venue', observation.subject + (manual === 'conflict' || changedAddress ? linkEvidence(observation) : '')), kind: 'venue' as const,
      name, data: { address, insideBerlin: !!location || explicitBerlin } };
    if (geocoding && !['not-configured', 'offline'].includes(geocoding.status)) flag(this.store, 'venue-geocoding', observation.subject, `Review location lookup: ${name}`,
      { observation, entityId: entity.id, geocoding, candidates: candidates.map(c => c.entity) }, 'open', 88, linkEvidence(observation));
    const sourceFetchFailed = observation.data.addressEvidence?.status === 'request-failed';
    if (!location && !explicitBerlin) flag(this.store, 'venue-location', observation.subject,
      `${sourceFetchFailed ? 'Venue address request failed' : 'Confirm Berlin location'}: ${name}`,
      { observation, entityId: entity.id, candidates: candidates.map(c => c.entity), geocoding, reason: 'No verified Berlin venue or explicit Berlin address; excluded from public listings.' }, 'open', 90, linkEvidence(observation));
    return this.bind(observation, withLocation(entity), 'provisional');
  }
}
