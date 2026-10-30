import TmdbClient, { TmdbSearchResult, tmdbCandidate, tmdbMovieData } from '../tmdb-client';
import { fetchOmdbData } from '../omdb-client';
import { DecisionEngine } from './decision-model';
import { Entity, FieldValue, Observation, fingerprint, normalize } from './domain';
import { flag, identityConflict, similarity } from './resolve';
import { PipelineStore } from './store';
import { parseLabel } from './labels';
import { CachedFilmEvidence, corroboratedTitleExtension, creditNames, filmMetadataInput, fullTitleMatches, sameFilmWithDifferentYear, sharedCast, sharedDirector, supportsFilmIdentity } from './identity-evidence';
import { filmSearchTitles } from '../../shared/film-title-search';
import { cachedDirectorAliases } from './person-aliases';
import type { FilmScreeningMatch } from './film-screening-evidence';
import { sourceCandidates, selectEvidence } from './evidence-policy';
import { providerDerived } from './lineage';
import { checkFieldCorrections } from './correction-evidence';
import type { Diagnostic } from '../../shared/contracts';
import { failureDiagnostic } from './outcomes';

const DAY = 86400000;
const empty = (value: any) => value == null || value === '' || (Array.isArray(value) && !value.length);
const stableFields = new Set(['director', 'directors', 'writers', 'cast', 'year', 'originalTitle', 'tmdbTitle', 'alternativeTitles', 'posterUrl', 'backdropUrl', 'plot', 'genres', 'keywords', 'country', 'productionCountries', 'productionCompanies', 'originalLanguage', 'spokenLanguages', 'trailerUrl', 'ageRating', 'certifications', 'tagline', 'imdbId', 'externalIds', 'releaseDate', 'germanReleaseDate', 'homepage', 'awards']);

export interface EnrichmentOptions { tmdb?: TmdbClient | null; omdbKey?: string; force?: boolean; now: string; identityEvidence?: CachedFilmEvidence;
  providerUnavailable?: boolean;
  diagnostic?: (value: Diagnostic) => void;
  screeningPeer?: { entityId: string; tmdbId: number; matches: FilmScreeningMatch[] } }

export async function enrichEntity(store: PipelineStore, engine: DecisionEngine, entity: Entity, sources: Observation[], options: EnrichmentOptions): Promise<Record<string, any>> {
  const attributedCandidates = sourceCandidates(sources, options.now);
  const selected = selectEvidence(attributedCandidates).selected;
  const prior = store.fields(entity.id);
  const nowMs = Date.parse(options.now);
  const set = (field: string, value: any, source: string, observationId: string | null, observedAt: string, reason: string, verified = true) => {
    selected.set(field, { field, value, source, observationId, observedAt, selectedAt: options.now, reason, identityVerified: verified,
      evidenceRole: verified && source.startsWith('TMDb:') ? 'tmdb' : verified && source.startsWith('OMDb:') ? 'omdb' : 'listing' });
  };
  const rankedSources = [...sources].sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.subject.localeCompare(b.subject));
  const labelYear = rankedSources.find(source => parseLabel(source.data.rawTitle || source.data.title).year);
  if (!selected.has('year') && labelYear) set('year', parseLabel(labelYear.data.rawTitle || labelYear.data.title).year, labelYear.source,
    labelYear.id, labelYear.observedAt, 'Explicit year interpreted from the source label', false);
  let acceptedId = entity.data.tmdbId as number | undefined;
  const metadataSubject = `metadata:${entity.id}`;
  const originalInput = filmMetadataInput(entity);
  const retainedVerification = entity.data.tmdbId && entity.data.metadataEvidence === fingerprint(originalInput)
    && prior.some(field => field.identityVerified && field.source === `TMDb:${entity.data.tmdbId}`)
    && !sources.some(source => providerDerived(source, 'tmdb'));
  const identitySources = sources.filter(source => source.provenance?.upstreamLineage.length && !providerDerived(source, 'tmdb'));
  const independentFields = selectEvidence(sourceCandidates(identitySources, options.now)).selected;
  const identityInput = sources.length && identitySources.length !== sources.length && !retainedVerification
    ? { ...originalInput, year: independentFields.get('year')?.value ?? null, director: independentFields.get('director')?.value ?? null }
    : originalInput;
  // Supplemental matching evidence must come from independent source fields, never prior provider enrichment.
  const input = { ...identityInput, runtime: independentFields.get('runtime')?.value ?? null,
    country: independentFields.get('country')?.value ?? null,
    originalTitle: independentFields.get('originalTitle')?.value ?? null };
  const evidence = fingerprint(originalInput);
  const established = entity.data.tmdbId && entity.data.metadataEvidence === evidence;
  const retainedIdentitySources = retainedVerification
    ? store.linkedObservations(entity.id).filter(source => source.kind === 'listing' && !providerDerived(source, 'tmdb')) : [];
  const identityCast = [...new Set([...identitySources, ...retainedIdentitySources].flatMap(source => source.data.cast ?? []))];
  const override = store.overrides(metadataSubject).filter(o => o.action === 'patch').slice(-1)[0];
  if (override?.patch && Object.hasOwn(override.patch, 'tmdbId')) {
    if (override.evidenceFingerprint === evidence) acceptedId = override.patch.tmdbId || undefined;
    else {
      acceptedId = undefined;
      flag(store, 'correction-conflict', metadataSubject, `Review changed metadata evidence: ${entity.name}`, { entity, correction: override }, 'open', 100, evidence);
    }
  }
  if (entity.data.metadataEvidence !== evidence && !override) acceptedId = undefined;
  const peer = options.screeningPeer && store.entity(options.screeningPeer.entityId);
  let peerSupported = !!(peer && options.screeningPeer!.matches.some(match => match.leftIds.includes(entity.id) && match.rightIds.includes(peer.id)
      || match.rightIds.includes(entity.id) && match.leftIds.includes(peer.id)) && !override && !peer.data.metadataAnchorId
    && peer.data.tmdbId === options.screeningPeer!.tmdbId
    && peer.data.metadataEvidence === fingerprint(filmMetadataInput(peer))
    && store.fields(peer.id).some(field => field.identityVerified && field.source === `TMDb:${peer.data.tmdbId}`)
    && (!acceptedId || acceptedId === peer.data.tmdbId));
  if (!acceptedId && peerSupported) acceptedId = peer!.data.tmdbId;
  const correctedOriginal = store.overrides(`entity:${entity.id}`).filter(correction => correction.action === 'patch'
    && Object.hasOwn(correction.patch?.fields ?? {}, 'originalTitle')).slice(-1)[0]?.patch?.fields.originalTitle;
  // A reviewed original title is independent evidence, not just a search hint.
  // Provider-derived historic titles remain excluded from identity corroboration.
  if (correctedOriginal) input.originalTitle = correctedOriginal;
  const explicitOriginalTitles = [correctedOriginal, ...rankedSources.map(source => source.data.originalTitle), entity.data.originalTitle].filter(Boolean);
  const previousOriginal = prior.find(field => field.field === 'originalTitle' && field.identityVerified
    && entity.data.metadataEvidence === evidence && nowMs - Date.parse(field.observedAt) <= 365 * DAY)?.value;
  const searchTitles = filmSearchTitles([...new Set<string>([...explicitOriginalTitles, previousOriginal, ...rankedSources.map(source => source.data.altTitle), entity.name, ...(entity.data.titles ?? [])]
    .filter(Boolean).map(title => parseLabel(title).title))]);
  let personLookups = 0;
  const directorAliasesFor = async (full: any, candidate: any): Promise<string[]> => {
    const aliases = cachedDirectorAliases(store, full, options.now);
    // Refresh aliases for accepted identities too, so cache expiry cannot erase a valid pen-name match.
    if (!input.director || sharedDirector(input, { ...candidate, directorAliases: aliases }) || !fullTitleMatches(input, candidate)
      || !input.year || !candidate.year || Math.abs(Number(input.year) - Number(candidate.year)) > 1) return aliases;
    for (const credit of (full?.credits?.crew ?? []).filter((person: any) => ['Director', 'Co-Director'].includes(person.job)).slice(0, 2)) {
      if (!Number.isInteger(credit.id) || credit.id <= 0) continue;
      const key = `tmdb-person:${credit.id}`; const oldPerson = store.resource(key);
      if (oldPerson && nowMs - Date.parse(oldPerson.fetchedAt) <= 7 * DAY) continue;
      if (!options.tmdb?.getPersonAliases || personLookups >= 4) continue;
      personLookups++;
      const person = await options.tmdb.getPersonAliases(credit.id);
      if (person?.id === credit.id) store.saveResource(key, person, options.now);
    }
    return cachedDirectorAliases(store, full, options.now);
  };
  if (entity.kind === 'film' && !acceptedId && !override && !options.force) {
    const validated = options.identityEvidence?.match({ ...input, cast: identityCast });
    if (validated) {
      acceptedId = validated.id;
      flag(store, 'metadata-match', metadataSubject, `External film identity corroborated: ${entity.name}`,
        { entityId: entity.id, listing: input, selectedId: acceptedId, apiEvidence: validated,
          resolutionCode: 'independent-provider-evidence', resolution: 'The source credits/year independently identify one retained provider detail bundle. Its accepted identity can consolidate duplicate source records.' }, 'caution', 40, evidence);
    }
  }
  const searchEvidence = fingerprint({ identity: evidence, queries: searchTitles, retrieval: 'year-assisted-v4' });
  const searchKey = 'tmdb-search:' + searchEvidence;
  const previousPending = store.issues().find(issue => issue.subject === metadataSubject && issue.type === 'metadata-match' && issue.status === 'open');
  if (!options.providerUnavailable && entity.kind === 'film' && (options.tmdb || store.resource(searchKey)) && !acceptedId && !(override?.patch && override.patch.tmdbId === null)) {
    const errorKey = 'tmdb-search-errors:' + searchEvidence;
    const errorsBefore = options.tmdb?.retrievalErrors?.().length ?? 0;
    let retrievalErrors: any[] = [];
    let candidates: TmdbSearchResult[] | undefined;
    const cached = store.resource(searchKey);
    if (!options.force && cached && nowMs - Date.parse(cached.fetchedAt) < DAY) {
      candidates = cached.data; retrievalErrors = [...(store.resource(errorKey)?.data ?? [])];
    }
    else if (options.tmdb) {
      candidates = await options.tmdb.candidates(searchTitles, { year: input.year });
      store.saveResource(searchKey, candidates, options.now);
      store.saveResource(errorKey, options.tmdb.retrievalErrors?.().slice(errorsBefore) ?? [], options.now);
    }
    candidates ??= [];
    const titleKeys = new Set(searchTitles.map(normalize));
    // Full-title results can appear below more popular partial-name hits. Retrieve those details first.
    const exactTitle = (candidate: TmdbSearchResult) => [candidate.title, candidate.original_title].some(title => titleKeys.has(normalize(title || '')));
    const yearMatch = (candidate: TmdbSearchResult) => !!input.year && !!candidate.release_date
      && Math.abs(Number(candidate.release_date.slice(0, 4)) - Number(input.year)) <= 1;
    candidates.sort((a, b) => Number(exactTitle(b)) - Number(exactTitle(a)) || Number(yearMatch(b)) - Number(yearMatch(a)));
    const details = [] as any[];
    for (const candidate of candidates) {
      if (details.length >= 8) break;
      const year = Number(candidate.release_date?.slice(0, 4)) || null;
      if (identityConflict(input, { year }) && !(creditNames(input.director).length && identityCast.length >= 2
        && [candidate.title, candidate.original_title].some(title => titleKeys.has(normalize(title || ''))))) continue;
      const detailKey = `tmdb-detail:${candidate.id}`;
      const old = store.resource(detailKey);
      const reused = !options.force && old && nowMs - Date.parse(old.fetchedAt) < 7 * DAY;
      const full = reused ? old!.data : await options.tmdb?.getMovieDetails(candidate.id);
      if (!full) continue;
      if (!reused) store.saveResource(detailKey, full, options.now);
      const enriched = tmdbCandidate(full, candidate);
      enriched.directorAliases = await directorAliasesFor(full, enriched);
      if (identityConflict(input, enriched) && !sameFilmWithDifferentYear({ ...input, cast: identityCast }, enriched)) continue;
      details.push(enriched);
    }
    retrievalErrors.push(...(options.tmdb?.retrievalErrors?.().slice(errorsBefore) ?? []));
    // Search results are candidates, never proof. The exact route requires title + year + director.
    const exact = details.filter(candidate => [entity.name, ...(entity.data.titles ?? [])]
      .some(title => [candidate.title, candidate.originalTitle, ...(candidate.alternativeTitles ?? [])].filter(Boolean).some(t => normalize(t) === normalize(title)))
      && input.year && candidate.year === input.year && input.director && candidate.director
      && [candidate.director, ...(candidate.directors ?? [])].some(director => normalize(input.director) === normalize(director)));
    const corroborated = details.filter(candidate => (fullTitleMatches(input, candidate) || corroboratedTitleExtension(input, candidate))
      && supportsFilmIdentity({ ...input, cast: identityCast }, candidate));
    if (corroborated.length === 1) acceptedId = corroborated[0].id;
    else if (exact.length === 1) acceptedId = exact[0].id;
    else if (details.length) {
      const modelCandidates = details.map(candidate => ({ id: candidate.id, title: candidate.title, originalTitle: candidate.originalTitle,
        alternativeTitles: candidate.alternativeTitles.slice(0, 12), year: candidate.year, director: candidate.director, directors: candidate.directors,
        cast: candidate.cast, country: candidate.country, runtime: candidate.runtime, originalLanguage: candidate.originalLanguage,
        spokenLanguages: candidate.spokenLanguages, releaseDate: candidate.releaseDate, imdbId: candidate.imdbId, overview: (candidate.overview || '').slice(0, 800) }));
      const result = await engine.decide({ task: 'metadata', state: { listing: input, sourceObservations: sources.map(s => ({ source: s.source, data: s.data })), candidates: modelCandidates }, questions: {
        identity: { instructions: 'Which TMDb candidate is this exact film? Avoid remakes, similarly titled works, shorts and unrelated translations. Popularity is not identity evidence. Choose insufficient if the listing cannot distinguish candidates.',
          choices: { ...Object.fromEntries(modelCandidates.map(c => [String(c.id), JSON.stringify(c)])),
            different: 'None of these candidates is this film', insufficient: 'Evidence does not establish a unique candidate' } },
      } });
      const choice = details.find(c => String(c.id) === result.response?.answers.identity.choice);
      if (result.accepted && choice && supportsFilmIdentity({ ...input, cast: identityCast }, choice)) acceptedId = choice.id;
      flag(store, 'metadata-match', metadataSubject, `${acceptedId ? 'Model selected metadata' : 'Resolve metadata'}: ${entity.name}`,
        { entityId: entity.id, evidence, listing: input, candidates: details, decision: result, selectedId: acceptedId ?? null, retrievalErrors },
        acceptedId ? 'caution' : 'open', 85, evidence);
    } else {
      const noResults = candidates.length === 0 && retrievalErrors.length === 0;
      flag(store, 'metadata-match', metadataSubject, `${noResults ? 'No external metadata available' : 'No verified metadata candidate'}: ${entity.name}`,
        { entityId: entity.id, evidence, listing: input, candidates: details, retrievalErrors,
          ...(noResults ? { resolutionCode: 'metadata-unavailable-source-retained',
            resolution: 'The API search succeeded without a candidate. Keep the source listing and its known fields; no external identity is inferred.' } : {}) }, noResults ? 'caution' : 'open', 55, evidence);
    }
  }
  else if (entity.kind === 'film' && !acceptedId && !override && previousPending) {
    flag(store, 'metadata-match', metadataSubject, `Metadata verification pending: ${entity.name}`,
      { ...previousPending.details, entityId: entity.id, listing: input, evidence,
        reason: 'The source film identity is retained. No current API query is available for its updated aliases; the unresolved metadata review remains open.' },
      'open', previousPending.priority, evidence);
  }
  let metadata: any = null;
  if (acceptedId) {
    const key = `tmdb-enrichment:${acceptedId}`;
    const cached = store.resource(key);
    if (!options.force && cached && nowMs - Date.parse(cached.fetchedAt) < DAY) metadata = cached.data;
    else if (options.tmdb) {
      const detailKey = `tmdb-detail:${acceptedId}`; const priorDetail = store.resource(detailKey);
      const reuseDetail = !options.force && priorDetail && nowMs - Date.parse(priorDetail.fetchedAt) < DAY;
      const full = reuseDetail ? priorDetail!.data : await options.tmdb.getMovieDetails(acceptedId);
      if (full && !reuseDetail) store.saveResource(detailKey, full, options.now);
      metadata = full ? await options.tmdb.enrichSelected(acceptedId, undefined, entity.name, full.details?.id === acceptedId ? full : undefined) : null;
      if (metadata) store.saveResource(key, metadata, reuseDetail ? priorDetail!.fetchedAt : options.now);
    }
    if (!metadata && cached) metadata = cached.data;
    if (!metadata && !options.force) {
      const detail = store.resource(`tmdb-detail:${acceptedId}`);
      if (detail?.data.details?.id === acceptedId && nowMs - Date.parse(detail.fetchedAt) <= 7 * DAY) {
        metadata = tmdbMovieData(detail.data);
        store.saveResource(key, metadata, detail.fetchedAt);
      }
    }
    const completeCredits = store.resource(`tmdb-detail:${acceptedId}`)?.data.credits;
    const verification = { ...metadata, year: metadata?.releaseYear,
      directorAliases: cachedDirectorAliases(store, store.resource(`tmdb-detail:${acceptedId}`)?.data, options.now),
      ...(completeCredits ? { cast: completeCredits.cast ?? [], directors: (completeCredits.crew ?? []).filter((person: any) => ['Director', 'Co-Director'].includes(person.job)) } : {}) };
    if (metadata) verification.directorAliases = await directorAliasesFor(store.resource(`tmdb-detail:${acceptedId}`)?.data, verification);
    const peerSources = peer ? store.linkedObservations(peer.id).filter(source => source.kind === 'listing'
      && source.provenance?.upstreamLineage.length && !providerDerived(source, 'tmdb')) : [];
    const peerFields = selectEvidence(sourceCandidates(peerSources, options.now)).selected;
    if (metadata && peerSupported && !supportsFilmIdentity({ ...filmMetadataInput(peer!), cast: peerSources.flatMap(source => source.data.cast ?? []),
      runtime: peerFields.get('runtime')?.value, country: peerFields.get('country')?.value }, verification)
      && !store.overrides(`metadata:${peer!.id}`).some(correction => correction.action === 'patch'
        && correction.patch?.tmdbId === acceptedId && correction.evidenceFingerprint === peer!.data.metadataEvidence)) {
      peerSupported = false;
      flag(store, 'metadata-match', metadataSubject, `Verified peer metadata changed: ${entity.name}`,
        { entityId: entity.id, anchorEntityId: peer!.id, listing: input, tmdbId: acceptedId,
          reason: 'The provider bundle no longer corroborates the independent anchor. Shared source screenings do not validate an unrelated API record.' }, 'open', 90, evidence);
      metadata = null; acceptedId = undefined;
    }
    const independentSupport = metadata && supportsFilmIdentity({ ...input, cast: identityCast }, verification);
    if (metadata && !override && !peerSupported && !independentSupport) {
      flag(store, 'metadata-match', metadataSubject, `External identity lacks independent support: ${entity.name}`,
        { entityId: entity.id, listing: input, tmdbId: acceptedId, resolutionCode: 'independent-evidence-required',
          reason: 'A prior selection or name hit alone does not establish identity. Compatible source credits/year or an independently verified identifier are required.' }, 'open', 85, evidence);
      metadata = null; acceptedId = undefined;
    }
    const verifiedYearDifference = metadata && sameFilmWithDifferentYear({ ...input, cast: identityCast }, verification);
    // A reviewed database identity can explicitly settle a source's misspelled director,
    // while changed source evidence, unrelated titles and larger year conflicts still stop it.
    const reviewedNameDifference = metadata && override?.evidenceFingerprint === evidence && override.patch?.tmdbId === acceptedId
      && fullTitleMatches(input, verification) && input.year && verification.year
      && Math.abs(Number(input.year) - Number(verification.year)) <= 1;
    if (metadata && identityConflict(input, verification) && !peerSupported && !verifiedYearDifference && !reviewedNameDifference) {
      flag(store, 'metadata-conflict', metadataSubject, `Metadata contradicts source identity: ${entity.name}`,
        { entityId: entity.id, listing: input, tmdbId: acceptedId, metadata }, 'open', 100, evidence);
      metadata = null; acceptedId = undefined;
    }
    if (metadata && reviewedNameDifference && identityConflict(input, verification)) flag(store, 'metadata-conflict', metadataSubject,
      `Reviewed source/provider credit difference: ${entity.name}`, { entityId: entity.id, listing: input, tmdbId: acceptedId,
        reportedDirector: input.director, providerDirector: metadata.director, correctionId: override.id,
        resolutionCode: 'reviewed-provider-credit-difference', resolution: override.reason }, 'caution', 40, evidence);
    if (verifiedYearDifference) flag(store, 'metadata-conflict', metadataSubject, `Source/provider year difference retained: ${entity.name}`,
      { entityId: entity.id, listing: input, tmdbId: acceptedId, reportedYear: input.year, establishedYear: metadata.releaseYear,
        resolutionCode: 'full-title-director-cast-year-difference',
        resolution: 'The complete title, director and at least two cast members independently identify one work. The provider release year is published; the source year remains attributed in the original evidence.' }, 'caution', 40, evidence);
    if (metadata) {
      entity.data.tmdbId = acceptedId; entity.data.metadataEvidence = evidence;
      entity.data.verifiedImdbId = metadata.imdbId ?? null;
      if (peerSupported && !independentSupport) entity.data.metadataAnchorId = peer!.id;
      else delete entity.data.metadataAnchorId;
      if (peerSupported) flag(store, 'metadata-match', metadataSubject, `Screenings corroborate verified metadata: ${entity.name}`,
        { entityId: entity.id, listing: input, selectedId: acceptedId, anchorEntityId: peer!.id,
          screeningMatches: options.screeningPeer!.matches, resolutionCode: 'screening-supported-verified-peer',
          resolution: 'Original source screenings establish the same film as an independently verified peer. Source title/year/credit mistakes do not invalidate the established film identity; the original source values remain retained.' }, 'caution', 40, evidence);
      for (const [field, value] of Object.entries(metadata)) {
        const target = field === 'releaseYear' ? 'year' : field;
        // Runtime belongs to a known edition; never copy a generic TMDb runtime to an extended cut.
        if (target === 'runtime' && sources.every(s => !!parseLabel(s.data.rawTitle || s.data.title).modality.edition)) continue;
        const fetchedAt = store.resource(key)?.fetchedAt ?? options.now;
        const maxAge = stableFields.has(target) ? 365 * DAY : target === 'runtime' ? 30 * DAY : 2 * DAY;
        if (!empty(value) && nowMs - Date.parse(fetchedAt) <= maxAge)
          set(target, value, `TMDb:${acceptedId}`, null, fetchedAt, peerSupported && !independentSupport
            ? `Metadata from the independently verified peer ${peer!.id}, corroborated by original source screenings`
            : 'Metadata from the accepted external film identity');
      }
      store.saveEntity(entity);
    }
  }
  if (!acceptedId && entity.data.tmdbId) {
    delete entity.data.tmdbId; delete entity.data.verifiedImdbId; delete entity.data.metadataAnchorId; store.saveEntity(entity);
  }
  const imdbId = selected.get('imdbId')?.value;
  let rejectedOmdb = false;
  if (imdbId && (options.omdbKey || store.resource(`omdb:${imdbId}`))) {
    const key = `omdb:${imdbId}`; const cached = store.resource(key);
    let ratings = !options.force && cached && nowMs - Date.parse(cached.fetchedAt) < DAY ? cached.data : null;
    const failed = store.resource(`omdb-error:${imdbId}`);
    if (!ratings && options.omdbKey && (!failed || nowMs - Date.parse(failed.fetchedAt) > 15 * 60000 || options.force)) {
      let failure: string | undefined;
      ratings = await fetchOmdbData(imdbId, options.omdbKey, reason => { failure = reason; });
      if (ratings) store.saveResource(key, ratings, options.now);
      else if (failure) store.saveResource(`omdb-error:${imdbId}`, { reason: failure }, options.now);
    }
    const failure = store.resource(`omdb-error:${imdbId}`);
    if (!ratings && failure) options.diagnostic?.({ ...failureDiagnostic('ratings', 'optional-provider-unavailable', failure.data.reason,
      'Keep eligible retained ratings and verified film metadata; omit unavailable optional fields.', true), recordId: entity.id });
    if (!ratings && failure) flag(store, 'source-unavailable', `pipeline:omdb:${imdbId}`, `OMDb lookup unavailable: ${entity.name}`,
      { entityId: entity.id, imdbId, reason: failure.data.reason, resolutionCode: 'optional-provider-unavailable',
        resolution: 'Keep the established film and available metadata. Missing OMDb enrichment is an operational status and can be retried without an identity decision.' }, 'caution', 45);
    // A verified identifier and matching director establish the work even when providers report different release years.
    // Keep identity separate from field selection: the disputed OMDb dates must not replace the established dates.
    const verifiedFilm = metadata ? { ...metadata, year: metadata.releaseYear } : input;
    const exactVerifiedId = acceptedId && metadata?.imdbId === imdbId && ratings?.imdbId === imdbId
      && ratings.raw?.imdbID === imdbId && ratings.raw?.Type === 'movie';
    const yearDisagreement = !!(ratings?.metadata?.year && verifiedFilm.year
      && Math.abs(Number(ratings.metadata.year) - Number(verifiedFilm.year)) > 1);
    const creditsCorroborate = exactVerifiedId && (sharedDirector(verifiedFilm, ratings.metadata) || sharedCast(verifiedFilm, ratings.metadata) >= 2);
    const sameWorkDifferentYear = creditsCorroborate && yearDisagreement;
    if (ratings?.metadata && (ratings.imdbId !== imdbId || identityConflict(verifiedFilm, ratings.metadata) && !creditsCorroborate)) {
      flag(store, 'source-unavailable', `pipeline:omdb:${imdbId}`, `OMDb metadata conflicts with the verified film: ${entity.name}`,
        { entityId: entity.id, imdbId, reason: 'The exact IMDb lookup returned incompatible year/director evidence. OMDb data was withheld.', metadata: ratings.metadata }, 'open', 90);
      ratings = null;
      rejectedOmdb = true;
    }
    if (sameWorkDifferentYear) flag(store, 'source-unavailable', `pipeline:omdb:${imdbId}`, `OMDb release-year difference retained: ${entity.name}`,
      { entityId: entity.id, imdbId, metadata: ratings.metadata, resolutionCode: 'same-verified-id-different-year',
        establishedYear: verifiedFilm.year, reportedYear: ratings.metadata.year,
        resolution: 'Exact verified IMDb identity and corroborating credits identify the same work. Ratings and missing non-date fields may be used; established dates are preserved.' }, 'caution', 35);
    else if (creditsCorroborate && identityConflict(verifiedFilm, ratings.metadata)) flag(store, 'source-unavailable', `pipeline:omdb:${imdbId}`,
      `OMDb credit difference retained: ${entity.name}`, { entityId: entity.id, imdbId, metadata: ratings.metadata,
        resolutionCode: 'same-verified-id-supported-credits', resolution: 'The exact verified IMDb identity and overlapping credits identify the work. Established director credits are preserved.' }, 'caution', 35);
    if (ratings) {
      const fetchedAt = store.resource(key)?.fetchedAt ?? options.now;
      set('imdbRating', ratings.imdbRating, `OMDb:${imdbId}`, null, fetchedAt, 'Exact verified IMDb ID lookup');
      set('imdbVotes', ratings.imdbVotes, `OMDb:${imdbId}`, null, fetchedAt, 'Exact verified IMDb ID lookup');
      set('allRatings', ratings.ratings, `OMDb:${imdbId}`, null, fetchedAt, 'Exact verified IMDb ID lookup');
      for (const field of ['director', 'directors', 'writers', 'cast', 'country', 'spokenLanguages', 'genres', 'runtime', 'plot', 'posterUrl', 'year', 'releaseDate', 'certifications', 'awards']) {
        if (sameWorkDifferentYear && ['year', 'releaseDate'].includes(field)) continue;
        if (selected.has(field) || empty(ratings.metadata?.[field])) continue;
        if (field === 'runtime' && sources.every(source => !!parseLabel(source.data.rawTitle || source.data.title).modality.edition)) continue;
        set(field, ratings.metadata[field], `OMDb:${imdbId}`, null, fetchedAt, 'Missing field filled by the exact verified IMDb ID lookup');
      }
    }
  }
  const retainedDetails: FieldValue[] = [];
  const compatibleDetails = store.retainedSourceDetails(sources, (original, current) => {
    const profile = (observation: Observation) => {
      const label = parseLabel(observation.data.rawTitle || observation.data.title);
      return { ...observation.data, title: label.title, year: Number(observation.data.year) || label.year,
        tmdbId: observation.data.verifiedTmdbId };
    };
    const before = profile(original); const after = profile(current);
    return !identityConflict(before, after) && (normalize(before.title) === normalize(after.title) || supportsFilmIdentity(before, after));
  });
  // All retained details, including fields on this entity, pass the same identity gate.
  // A stable upstream subject alone cannot authorize facts about a replacement work.
  for (const previous of [...prior.filter(field => field.evidenceRole !== 'source-detail'), ...compatibleDetails]) {
    const detail = previous.evidenceRole === 'source-detail';
    if ((previous.source === 'manual' && previous.correctionId)
      || !detail && (selected.has(previous.field) || attributedCandidates.some(field => field.field === previous.field))) continue;
    const fromExternal = previous.identityVerified && (previous.evidenceRole === 'tmdb' || previous.evidenceRole === 'omdb');
    if (!fromExternal && sources.some(source => source.source === previous.source && source.fields?.[previous.field]?.state === 'absent')) continue;
    if (rejectedOmdb && previous.source.startsWith('OMDb:')) continue;
    if (fromExternal && (!acceptedId || (previous.source.startsWith('TMDb:') && previous.source !== `TMDb:${acceptedId}`)
      || (previous.source.startsWith('OMDb:') && previous.source !== `OMDb:${imdbId}`))) continue;
    const maxAge = stableFields.has(previous.field) ? 365 * DAY : previous.field === 'runtime' ? 30 * DAY : 2 * DAY;
    if (nowMs - Date.parse(previous.observedAt) <= maxAge) {
      const fallback = { ...previous, selectedAt: options.now,
        reason: `Historical fallback: ${previous.reason}`.replace(/(?:Historical fallback: )+/g, 'Historical fallback: ') };
      if (detail) retainedDetails.push(fallback);
      else selected.set(previous.field, fallback);
    }
  }
  if (retainedDetails.length) {
    const detailFields = new Set(retainedDetails.map(field => field.field));
    const ranked = selectEvidence([...selected.values(), ...retainedDetails,
      ...attributedCandidates.filter(field => detailFields.has(field.field))]).selected;
    selected.clear();
    for (const [field, value] of ranked) selected.set(field, value);
  }
  // Field-level manual values may explicitly clear a field; missing values do not imply clearing.
  checkFieldCorrections(store, entity.id, options.now);
  for (const correction of store.overrides(`entity:${entity.id}`).filter(o => o.action === 'patch')) {
    for (const [field, value] of Object.entries(correction.patch?.fields ?? {})) {
      set(field, value, 'manual', null, correction.createdAt, correction.reason);
      selected.get(field)!.correctionId = correction.id;
      selected.get(field)!.evidenceRole = 'manual-correction';
    }
  }
  store.saveFields(entity.id, [...selected.values()]);
  return Object.fromEntries([...selected.values()].map(field => [field.field, field.value]));
}
