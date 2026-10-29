import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fetchBerlinAddresses, fetchBerlinCinemas, OsmAddress, OsmCinema } from '../osm-client';
import { osmStreetPattern, parseVenueAddress, venueAddressesMatch } from './addresses';
import TmdbClient from '../tmdb-client';
import { recordAudit, sanitizeAudit } from '../audit-log';
import { DecisionEngine, configuredModel } from './decision-model';
import { DecisionModel, Entity, Observation, ParsedLabel, fingerprint, identity, normalize } from './domain';
import { ingestCollections } from './observations';
import type { SourceCollection } from '../../shared/contracts';
import { CollectionEnvelopeSchema, parsePublicSnapshot } from '../../shared/contracts';
import { refreshVenueObservations } from './source-venues';
import { refreshListingObservations } from './source-details';
import { CachedFilmEvidence, creditNames, filmMetadataInput } from './identity-evidence';
import { filmDisplayGroups } from './film-groups';
import { FilmScreening, filmScreeningMatches } from './film-screening-evidence';
import { consolidateVenues } from './venue-groups';
import { attachVenueWebsites } from './venue-websites';
import { GeoapifyGeocoder, VenueGeocoder } from './geocoding';
import { IdentityResolver, flag, identityConflict, interpret, linkEvidence } from './resolve';
import { enrichEntity } from './enrichment';
import { PublishedScreening, ScreeningInput, resolveScreenings, screeningModality } from './screenings';
import { PipelineStore } from './store';
import { configuredRegistry } from '../sources/defaults';
import type { SourceRegistry } from '../sources/registry';
import type { SourceDependencies } from '../sources/types';
import { selectEvidence, sourceCandidates } from './evidence-policy';
import { finalizeResolutionReview, resolutionOutcomes } from './resolution-review';
import { checkFieldCorrections } from './correction-evidence';
import { sourceDependencies as defaultSourceDependencies } from '../sources/dependencies';
import { collectionDiagnostics, failureDiagnostic, PipelineRunFailure, publicationResult, runDiagnostics } from './outcomes';
import type { Diagnostic, PublicationResult } from '../../shared/contracts';
import { OptionalProviderFailure, recoverableGeocoder, recoverableMetadata, recoverableModel } from './provider-recovery';
import { resolvePublicationRoot } from './publication-paths';

const DAY = 86400000;
export interface PipelineOptions {
  sourceRegistry?: SourceRegistry; sourceDependencies?: SourceDependencies;
  store: PipelineStore; collections?: SourceCollection[]; model?: DecisionModel | null;
  tmdb?: TmdbClient | null; omdbKey?: string; osm?: OsmCinema[]; osmAddresses?: OsmAddress[]; geocoder?: VenueGeocoder | null; network?: boolean;
  force?: boolean; now?: string; publish?: boolean; audit?: boolean; legacy?: any;
  operation?: 'acquisition' | 'replay' | 'recalculate'; publicationRoot?: string;
}

/** Structured operation boundary; runPipeline remains the compatible snapshot/recalculation interface. */
export async function runPipelineResult(options: PipelineOptions): Promise<PublicationResult> {
  try { return publicationResult(await runPipeline(options), options.collections ?? [], options.store.resource('pipeline:last-outcome')?.data.diagnostics ?? []); }
  catch (error) {
    return error instanceof PipelineRunFailure ? error.result : { schemaVersion: 1, outcome: 'fatal', snapshot: options.store.snapshot(),
      diagnostics: [failureDiagnostic('processing', 'processing-failed', (error as Error).message, 'Previous publication is preserved; repair the operation and retry.')] };
  }
}

export async function runPipeline(options: PipelineOptions): Promise<any> {
  const { store } = options;
  const registry = options.sourceRegistry ?? configuredRegistry(); const now = options.now ?? new Date().toISOString(); const owner = randomUUID();
  const runId = randomUUID(); let revision: number | undefined;
  const diagnostics: Diagnostic[] = [];
  if (!store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
  try {
    revision = store.revision;
    diagnostics.push(...collectionDiagnostics(options.collections ?? []));
    const dependencies: SourceDependencies = { ...(options.sourceDependencies ?? defaultSourceDependencies(store, { network: options.network, now, force: options.force })),
      diagnostic: value => { diagnostics.push(value); options.sourceDependencies?.diagnostic(value); } };
    store.beginReviewPass(now);
    store.run(runId, 'running', { sources: options.collections?.flatMap(input => {
      const envelope = CollectionEnvelopeSchema.safeParse(input);
      return envelope.success ? [{ source: envelope.data.sourceInstanceId, observedAt: envelope.data.observedAt, status: envelope.data.status }] : [];
    }) ?? [], revision });
    const engine = new DecisionEngine(store, recoverableModel(options.model === undefined ? options.network === false ? null : configuredModel() : options.model, value => diagnostics.push(value)), { now: () => now });
    if (!engine.model) flag(store, 'provider-configuration', 'pipeline:decision-model', 'Decision model is not configured',
      { reason: 'Rules and previous accepted decisions remain available. Ambiguous records require local review. Configure a model key to enable decisions.' }, 'caution', 30);
    if (options.legacy && !store.resource('legacy-import')) {
      store.saveResource('legacy-import', { movies: options.legacy.movies, scrapedAt: options.legacy.scrapedAt }, now);
      flag(store, 'legacy-evidence', 'pipeline:legacy', 'Previous enriched data retained as unverified legacy evidence',
        { count: options.legacy.movies?.length ?? 0, reason: 'Existing inferred identities are not promoted to verified facts. Source URLs/titles can retain compatible slugs.' }, 'caution', 20);
    }
    const ingestion = ingestCollections(store, options.collections ?? [], {
      cacheKey: (source, key) => { const instance = registry.instance(source); return instance ? registry.cacheKey(instance, key) : key; },
    });
    diagnostics.push(...ingestion.flatMap(item => item.diagnostics));
    if (options.operation === 'acquisition' && !ingestion.some(item => store.resource(`source-status:${item.sourceInstanceId}`)?.data.status === 'fresh'
      && ((item.acceptedScreenings ?? 0) > 0 || item.coverage.some(scope => scope.status === 'complete' && scope.emptyProgrammeConfirmed)))) {
      const message = 'No source returned fresh usable listings or validated confirmed empty coverage; keeping the published dataset unchanged.';
      throw new PipelineRunFailure(message, { schemaVersion: 1, outcome: 'preserved-acquisition-failure', snapshot: store.snapshot(), diagnostics: [
        ...diagnostics, failureDiagnostic('collection', 'total-acquisition-failure', message,
          'Previous publication remains available within its original freshness limits.', true)] });
    }
    let osm = options.osm;
    if (!osm) {
      const cached = store.resource('osm:berlin');
      osm = cached?.data ?? [];
      if (options.network !== false && (!cached || Date.parse(now) - Date.parse(cached.fetchedAt) > 30 * DAY || options.force)) {
        try { osm = await fetchBerlinCinemas(); store.saveResource('osm:berlin', osm, now); }
        catch { diagnostics.push(failureDiagnostic('geocoding', 'osm-unavailable', 'Berlin venue lookup is unavailable.',
          'Retain eligible location evidence; exclude locations which still lack verification.', true));
          flag(store, 'source-unavailable', 'pipeline:osm', 'Berlin venue lookup unavailable',
          { reason: 'OpenStreetMap request failed. Retain previous venue evidence; individual unverified locations enter review.' }, 'caution', 65); }
      }
    }
    let active = store.observations(undefined, true);
    const freshEnough = (observation: Observation) => Date.parse(now) - Date.parse(observation.observedAt) <= DAY;
    const screenings = active.filter(o => o.kind === 'screening' && freshEnough(o) && `${o.data.date}T${o.data.time}` >= berlinClock(now));
    const listingSubjects = new Set(screenings.map(o => o.data.listingSubject));
    const venueSubjects = new Set(screenings.map(o => o.data.venueSubject));
    await refreshListingObservations(store, active.filter(item => item.kind === 'listing' && listingSubjects.has(item.subject)), {
      network: options.network, now, registry, dependencies });
    active = store.observations(undefined, true);
    const addresses = [...(options.osmAddresses ?? [])];
    const venueObservations = await refreshVenueObservations(store, active.filter(o => o.kind === 'venue' && venueSubjects.has(o.subject)), {
      network: options.network, force: options.force, now, registry, dependencies });
    const streets = new Map<string, string[]>();
    for (const item of venueObservations) {
      if (osm.some(cinema => venueAddressesMatch(item.data.address, cinema.address || ''))) continue;
      const pattern = osmStreetPattern(item.data.address); if (!pattern) continue;
      streets.set(pattern, [...(streets.get(pattern) ?? []), item.data.address]);
    }
    // Query only relevant streets; buildings and address nodes can verify a location without proving a cinema identity.
    const pending: string[] = [];
    for (const pattern of streets.keys()) {
      const cached = store.resource(`osm:street:${fingerprint(pattern)}`);
      if (cached) addresses.push(...cached.data);
      if (options.osmAddresses === undefined && options.network !== false
        && (!cached || Date.parse(now) - Date.parse(cached.fetchedAt) > 30 * DAY || options.force)) pending.push(pattern);
    }
    for (let index = 0; index < Math.min(pending.length, 200); index += 20) {
      const patterns = pending.slice(index, index + 20);
      try {
        const found = await fetchBerlinAddresses(patterns); addresses.push(...found);
        for (const pattern of patterns) store.saveResource(`osm:street:${fingerprint(pattern)}`,
          found.filter(item => streets.get(pattern)!.some(address => parseVenueAddress(address)?.street === parseVenueAddress(item.address || '')?.street)), now);
      } catch { diagnostics.push(failureDiagnostic('geocoding', 'osm-addresses-unavailable', 'OSM address verification is unavailable.',
        'Retain eligible location evidence; exclude locations which still lack verification.', true));
        flag(store, 'source-unavailable', 'pipeline:osm-addresses', 'OSM address verification unavailable',
        { reason: 'Address lookup failed. Retaining previous evidence; individual unverified locations remain in review.' }, 'caution', 65); break; }
    }
    const geocoder = recoverableGeocoder(options.geocoder === null ? undefined : options.geocoder ?? new GeoapifyGeocoder(store, process.env.GEOAPIFY_API_KEY, { network: options.network, now, force: options.force }), value => diagnostics.push(value));
    const resolver = new IdentityResolver(store, engine, osm, addresses, geocoder, now);
    let venues = new Map<string, Entity>(); const films = new Map<string, Entity>(); const parsed = new Map<string, ParsedLabel>();
    for (const observation of venueObservations) venues.set(observation.subject, await resolver.venue(observation));
    venues = consolidateVenues(store, venues, now);
    venues = attachVenueWebsites(store, venues, venueObservations, osm);
    for (const observation of active.filter(o => o.kind === 'listing' && listingSubjects.has(o.subject))) {
      const label = await interpret(store, engine, observation); parsed.set(observation.subject, label);
      films.set(observation.subject, await resolver.film(observation, label));
    }
    const fieldData = new Map<string, any>();
    const identityEvidence = new CachedFilmEvidence(store, now);
    const tmdb = recoverableMetadata(options.tmdb !== undefined ? options.tmdb : options.network !== false && process.env.TMDB_API_KEY ? new TmdbClient(process.env.TMDB_API_KEY) : null);
    const uniqueFilms = [...new Map([...films.values()].map(entity => [entity.id, entity])).values()];
    const filmScreenings: FilmScreening[] = screenings.flatMap(observation => {
      const film = films.get(observation.data.listingSubject); const venue = venues.get(observation.data.venueSubject);
      const listing = store.head(observation.data.listingSubject);
      if (!film || !venue || venue.data.insideBerlin !== true || !listing) return [];
      return [{ filmId: film.id, source: observation.source, venueId: venue.id, date: observation.data.date,
        time: observation.data.time, title: listing.data.rawTitle || listing.data.title, auditorium: observation.data.auditorium,
        upstreamLineage: observation.provenance?.upstreamLineage }];
    });
    const sourceGroup = new Map<string, Entity[]>();
    const initialGroups = filmDisplayGroups(store, uniqueFilms, filmScreenings);
    const screeningMatches = filmScreeningMatches(initialGroups, filmScreenings);
    for (const group of initialGroups.values()) for (const entity of group) sourceGroup.set(entity.id, group);
    const strength = (entity: Entity) => Number(creditNames(entity.data.director).length > 0) * 2
      + Number(!!entity.data.year) + Math.min(creditNames(entity.data.cast).length, 2) + Number(!!entity.data.tmdbId);
    for (const entity of [...uniqueFilms].sort((a, b) => strength(b) - strength(a) || a.id.localeCompare(b.id))) {
      const sources = active.filter(o => o.kind === 'listing' && films.get(o.subject)?.id === entity.id)
        .map(o => ({ ...o, data: { ...o.data, year: parsed.get(o.subject)?.year ?? o.data.year } }));
      const verifiedPeer = sourceGroup.get(entity.id)?.some(peer => peer.id !== entity.id && fieldData.has(peer.id) && peer.data.tmdbId
        && store.fields(peer.id).some(field => field.identityVerified && field.source === `TMDb:${peer.data.tmdbId}`));
      const metadataCorrection = store.overrides(`metadata:${entity.id}`).some(correction => correction.action === 'patch');
      const screeningPeer = sourceGroup.get(entity.id)?.find(peer => peer.id !== entity.id && peer.data.tmdbId && !peer.data.metadataAnchorId
        && peer.data.metadataEvidence === fingerprint(filmMetadataInput(peer))
        && (!options.force || fieldData.has(peer.id))
        && (!store.overrides(`metadata:${peer.id}`).length || fieldData.has(peer.id))
        && store.fields(peer.id).some(field => field.identityVerified && field.source === `TMDb:${peer.data.tmdbId}`)
        && screeningMatches.some(match => match.leftIds.includes(entity.id) && match.rightIds.includes(peer.id)
          || match.rightIds.includes(entity.id) && match.leftIds.includes(peer.id)));
      // Source aliases share their resolved peer's publication metadata; avoid
      // another title search for an incomplete record with an established match.
      const retrieve = options.force || metadataCorrection || !verifiedPeer;
      const enrichmentOptions = { tmdb: retrieve ? tmdb : null, omdbKey: options.network === false ? undefined : options.omdbKey ?? process.env.OMDB_API_KEY,
        now, force: options.force, identityEvidence, diagnostic: (value: Diagnostic) => diagnostics.push(value),
        screeningPeer: screeningPeer ? { entityId: screeningPeer.id, tmdbId: screeningPeer.data.tmdbId,
          matches: screeningMatches.filter(match => match.leftIds.includes(entity.id) && match.rightIds.includes(screeningPeer.id)
            || match.rightIds.includes(entity.id) && match.leftIds.includes(screeningPeer.id)) } : undefined };
      try { fieldData.set(entity.id, await enrichEntity(store, engine, entity, sources, enrichmentOptions)); }
      catch (error) {
        if (!(error instanceof OptionalProviderFailure)) throw error;
        diagnostics.push({ ...failureDiagnostic('metadata', 'optional-provider-unavailable', error.message,
          'Use eligible retained metadata or source-only fields under the existing identity safeguards.', true), recordId: entity.id });
        fieldData.set(entity.id, await enrichEntity(store, engine, entity, sources, { ...enrichmentOptions, tmdb: null, providerUnavailable: true }));
      }
    }
    const resolvedGroups = filmDisplayGroups(store, uniqueFilms, filmScreenings);
    const previousMovies = store.snapshot()?.movies ?? [];
    const publicGroups = new Map<string, Entity[]>();
    for (const [key, group] of resolvedGroups) {
      const ids = new Set(group.map(entity => entity.id));
      const previous = previousMovies.filter((movie: any) => movie.kind === group[0].kind && movie.identityGroupKey
        && movie.sourceAliases?.some((alias: any) => ids.has(alias.entityId))
        && group.every(entity => !identityConflict(entity.data, { ...movie, verifiedImdbId: movie.identityStatus === 'verified' ? movie.imdbId : null })));
      const rememberedKeys = [...new Set(group.map(entity => store.resource(`published-identity:${entity.kind}:${entity.id}`)?.data.identityGroupKey).filter(Boolean))];
      const priorKey = previous.length === 1 ? previous[0].identityGroupKey : rememberedKeys.length === 1 ? rememberedKeys[0] : null;
      const stableKey = priorKey && (!resolvedGroups.has(priorKey) || priorKey === key) && !publicGroups.has(priorKey) ? priorKey : key;
      publicGroups.set(stableKey, group);
    }
    const groupForEntity = new Map<string, string>();
    for (const [key, group] of publicGroups) for (const entity of group) groupForEntity.set(entity.id, key);
    const groupedScreenings = new Map<string, ScreeningInput[]>();
    for (const observation of screenings) {
      const film = films.get(observation.data.listingSubject); const venue = venues.get(observation.data.venueSubject);
      if (!film || !venue) continue;
      const venueCorrections = store.overrides(`entity:${venue.id}`).filter(o => o.action === 'patch');
      const venueFields = Object.assign({}, venue.data, ...venueCorrections.map(c => c.patch?.fields ?? {}));
      if (venueFields.insideBerlin !== true) continue;
      const group = groupForEntity.get(film.id)!;
      const status = store.resource(`source-status:${observation.source}`)?.data;
      const stale = status?.status !== 'fresh' || observation.observedAt !== status.observedAt
        || Date.parse(now) - Date.parse(observation.observedAt) > 7 * 3600000;
      const records = groupedScreenings.get(group) ?? [];
      records.push({ observation, filmId: group, venueId: venue.id, cinema: venueFields.name || venue.name,
        modality: screeningModality(observation, parsed.get(observation.data.listingSubject)!.modality), stale }); groupedScreenings.set(group, records);
    }
    const legacy = store.resource('legacy-import')?.data?.movies ?? [];
    const reservedSlugs: Record<string, string> = { ...(store.resource('slug-registry')?.data ?? {}) };
    const movies: any[] = []; const usedSlugs = new Set<string>();
    const publicDecisions: any[] = [];
    for (const venue of new Map([...venues.values()].map(entity => [entity.id, entity])).values()) {
      if (venue.data.consolidationEvidence) publicDecisions.push({ entity: 'cinema', subject: venue.name, provider: 'identity resolver',
        action: 'corroborated-venue-identity', details: { address: venue.data.address, aliases: venue.data.aliases, ...venue.data.consolidationEvidence } });
    }
    for (const [key, group] of [...publicGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const input = groupedScreenings.get(key) ?? []; if (!input.length) continue;
      const presentations = await resolveScreenings(store, engine, input); if (!presentations.length) continue;
      group.sort((a, b) => a.id.localeCompare(b.id));
      const previousAnchor = store.resource(`public-identity:${key}`)?.data?.id;
      const anchor = previousAnchor && (!groupForEntity.has(previousAnchor) || groupForEntity.get(previousAnchor) === key) ? previousAnchor : group[0].id;
      store.saveResource(`public-identity:${key}`, { id: anchor }, now);
      const primary = group.find(e => e.id === anchor) ?? group[0];
      const identityEntity = [...group].sort((a, b) => Number(!!b.data.tmdbId) - Number(!!a.data.tmdbId)
        || strength(b) - strength(a) || a.id.localeCompare(b.id))[0];
      const groupSources = active.filter(o => o.kind === 'listing' && group.some(e => films.get(o.subject)?.id === e.id));
      const fieldResolution = selectEvidence([...group.flatMap(entity => store.fields(entity.id)), ...sourceCandidates(groupSources, now, true)], store, groupSources);
      const selectedFields = fieldResolution.selected;
      const metadata = Object.fromEntries([...selectedFields].map(([field, selected]) => [field, selected.value]));
      const sourceRecords = active.filter(o => o.kind === 'listing' && group.some(e => films.get(o.subject)?.id === e.id));
      const groupIds = new Set(group.map(entity => entity.id));
      const scheduleEvidence = screeningMatches.filter(match => match.leftIds.some(id => groupIds.has(id)) && match.rightIds.some(id => groupIds.has(id)));
      const pendingMetadata = store.issues().filter(issue => issue.type === 'metadata-match' && issue.status === 'open'
        && groupIds.has(issue.details.entityId));
      const canonicalReview = pendingMetadata.find(issue => issue.details.entityId === identityEntity.id);
      if (canonicalReview && pendingMetadata.length > 1 && scheduleEvidence.length) {
        const candidates = [...new Map(pendingMetadata.flatMap(issue => issue.details.candidates ?? []).map(candidate => [candidate.id, candidate])).values()];
        flag(store, 'metadata-match', canonicalReview.subject, canonicalReview.title,
          { ...canonicalReview.details, candidates, entityIds: [...groupIds], sourceSubjects: sourceRecords.map(record => record.subject),
            screeningMatches: scheduleEvidence }, 'open', canonicalReview.priority, canonicalReview.fingerprint);
        for (const issue of pendingMetadata.filter(issue => issue.id !== canonicalReview.id)) flag(store, 'metadata-match', issue.subject,
          `Metadata review consolidated: ${identityEntity.name}`, { ...issue.details, entityIds: [...groupIds], canonicalReviewId: canonicalReview.id,
            screeningMatches: scheduleEvidence, resolutionCode: 'same-film-metadata-review',
            resolution: 'Matching original source screenings establish one film. Its unresolved API candidates and source evidence are retained together in the canonical metadata review.' },
          'caution', 40, issue.fingerprint);
      }
      const sourceTitles = [...new Set(sourceRecords.flatMap(observation => sourceAlias(observation).labels))];
      const title = primary.name;
      if (group.length > 1) for (const issue of store.issues().filter(issue => issue.type === 'film-match' && issue.status === 'open'
        && sourceRecords.some(record => record.subject === issue.subject))) {
        if (!issue.details.candidates?.length || !issue.details.candidates.every((candidate: Entity) => groupForEntity.get(candidate.id) === key)) continue;
        flag(store, 'film-match', issue.subject, `Film identity reconciled: ${title}`,
          { observation: store.head(issue.subject), candidates: issue.details.candidates, targetId: identityEntity.id, publicId: anchor, entityIds: group.map(entity => entity.id),
            screeningMatches: scheduleEvidence, resolutionCode: 'compatible-source-film-group',
            resolution: 'Independent provider evidence, corroborating credits, or original source screenings establish one film group. A complete title and shared viewing, or a distinctive repeated schedule, can outweigh mistakes in source titles/credits.' },
          'caution', 40, issue.fingerprint);
      }
      const slugResource = store.resource(`slug:${anchor}`);
      const compatibleLegacy = legacy.filter((old: any) => sourceRecords.some(o => o.data.url && o.data.url === old.url)
        && (!old.year || !metadata.year || Math.abs(old.year - metadata.year) <= 1)
        && [old.title, ...(old.sourceTitles ?? [])].some((label: string) => sourceTitles.some(t => normalize(t) === normalize(label))));
      const baseSlug = slugResource?.data?.slug || (compatibleLegacy.length === 1 ? compatibleLegacy[0].slug : null)
        || slugify(metadata.tmdbTitle || title) || anchor;
      let slug = baseSlug;
      const unavailable = (candidate: string) => usedSlugs.has(candidate) || !!(reservedSlugs[candidate] && reservedSlugs[candidate] !== anchor)
        || (!slugResource && !compatibleLegacy.length && legacy.some((old: any) => old.slug === candidate));
      if (unavailable(slug)) slug = `${baseSlug}-${metadata.year || anchor.slice(-8)}`;
      if (unavailable(slug)) slug = `${baseSlug}-${anchor.slice(-8)}`;
      reservedSlugs[slug] = anchor;
      usedSlugs.add(slug); store.saveResource(`slug:${anchor}`, { slug }, now);
      const showings: Record<string, Record<string, any[]>> = {};
      for (const screening of presentations) {
        const { date, time, ...entry } = screening;
        showings[date] ??= {}; showings[date][time] ??= []; showings[date][time].push(entry);
      }
      const cinemaIds = new Set(input.map(s => s.venueId));
      const cinemas = [...cinemaIds].map(id => {
        const venue = store.entity(id)!;
        checkFieldCorrections(store, id, now);
        const corrections = store.overrides(`entity:${id}`).filter(c => c.action === 'patch');
        return { id, name: venue.name, ...venue.data, ...Object.assign({}, ...corrections.map(c => c.patch?.fields ?? {})),
          sourceAliases: venueObservations.filter(observation => venues.get(observation.subject)?.id === id).map(observation => sourceAlias(observation, id)) };
      });
      const aliases = sourceRecords.map(observation => sourceAlias(observation, identityEntity.id));
      const reclassifiedSlugs = sourceRecords.flatMap(observation => ['film', 'programme'].filter(kind => kind !== primary.kind).flatMap(kind => {
        const old = store.resource(`source-alias:${kind}:${observation.subject}`)?.data;
        if (!old || old.source !== observation.source || old.evidenceFingerprint !== linkEvidence(observation)
          || normalize(store.entity(old.entityId)?.name || '') !== normalize(title)
          || store.overrides(observation.subject).some(correction => correction.action === 'separate')) return [];
        const publicId = store.resource(`published-identity:${kind}:${old.entityId}`)?.data.publicId || old.entityId;
        return [store.resource(`slug:${publicId}`)?.data.slug, store.resource(`slug:${old.entityId}`)?.data.slug].filter(Boolean);
      }));
      for (const alias of aliases) store.saveResource(`source-alias:${primary.kind}:${alias.subject}`, { ...alias, kind: primary.kind }, now);
      for (const entity of group) store.saveResource(`published-identity:${primary.kind}:${entity.id}`,
        { memberId: entity.id, entityId: identityEntity.id, publicId: anchor, identityGroupKey: key, kind: primary.kind }, now);
      for (const cinema of cinemas) {
        for (const alias of cinema.sourceAliases) store.saveResource(`source-alias:venue:${alias.subject}`, { ...alias, kind: 'venue' }, now);
        const members = new Set<string>([cinema.id, ...cinema.sourceAliases.map(alias => store.link(alias.subject)?.entityId).filter(Boolean)]);
        for (const memberId of members) store.saveResource(`published-identity:venue:${memberId}`,
          { memberId, entityId: cinema.id, publicId: cinema.id, identityGroupKey: cinema.id, kind: 'venue' }, now);
      }
      movies.push({ ...emptyMovie(), ...metadata, id: anchor, identityGroupKey: key, title, slug,
        slugAliases: [...new Set([...reclassifiedSlugs, ...compatibleLegacy.map((old: any) => old.slug),
          ...group.map(entity => store.resource(`slug:${entity.id}`)?.data.slug),
          ...previousMovies.filter((old: any) => old.id === anchor || group.some(entity => entity.id === old.id)).flatMap((old: any) => [old.slug, ...(old.slugAliases ?? [])]),
        ].filter((old: string) => old && old !== slug))],
        criticTitle: metadata.tmdbTitle && metadata.tmdbTitle !== title ? title : null,
        url: metadata.url ?? null,
        kind: primary.kind, isSpecial: primary.kind === 'programme', sourceTitles, variants: [...new Set(presentations.flatMap(s => s.variants))],
        cinemas, showings, identityStatus: group.some(entity => entity.data.tmdbId) ? 'verified' : 'source-only',
        provenance: Object.fromEntries(selectedFields),
        resolution: { schemaVersion: 1, outcome: 'selected', entity: { id: anchor, kind: primary.kind, name: title },
          reason: group.some(entity => entity.data.tmdbId) ? 'Verified external identity with protected source links' : 'Established source identity; external metadata remains unverified',
          supportingObservationIds: sourceRecords.map(record => record.id), conflictingEntityIds: [],
          fields: fieldResolution.fields, unresolvedQuestions: [] },
        sourceSubjects: sourceRecords.map(o => o.subject),
        sourceAliases: aliases,
      });
      if (group.length > 1) publicDecisions.push({ entity: 'movie', subject: title, provider: 'identity resolver', action: 'corroborated-film-identity',
        details: { entityIds: group.map(e => e.id), tmdbId: group.find(entity => entity.data.tmdbId)?.data.tmdbId, screeningMatches: scheduleEvidence,
          titles: group.map(e => e.name), evidence: group[0].data.tmdbId && group.every(entity => entity.data.tmdbId === group[0].data.tmdbId)
            ? 'Independently validated provider identity'
            : scheduleEvidence.length ? 'Original source schedules establish the same film despite noisy title/year/credit claims; manually separated and independently verified conflicting identities remain distinct.'
              : 'Compatible complete source labels with no contradictory identity evidence or ambiguous candidates; unknown/shared lineage is not independent corroboration' } });
    }
    const canonicalSlugs = new Set(movies.map(movie => movie.slug));
    const aliasCounts = new Map<string, number>();
    for (const movie of movies) for (const alias of movie.slugAliases) aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1);
    for (const movie of movies) movie.slugAliases = movie.slugAliases.filter((alias: string) => !canonicalSlugs.has(alias) && aliasCounts.get(alias) === 1);
    store.endReviewPass(now);
    finalizeResolutionReview(store, now);
    const resolution = resolutionOutcomes(store, [...films.values(), ...venues.values()], movies, now);
    const data = { schemaVersion: 2, movies, total: movies.length, scrapedAt: now, ingestion, ...resolution,
      programmeStatus: movies.length ? 'available' : ingestion.some(item => item.coverage.some(scope => scope.status === 'complete' && scope.emptyProgrammeConfirmed)) ? 'empty' : 'no-current-support',
      sources: [...new Set(active.map(o => o.source))].map(source => store.resource(`source-status:${source}`)?.data).filter(Boolean),
      review: { open: store.issues().filter(i => i.status === 'open').length, caution: store.issues().filter(i => i.status === 'caution').length } };
    parsePublicSnapshot(data);
    store.saveResource('slug-registry', reservedSlugs, now);
    const result = publicationResult(data, options.collections ?? [], diagnostics);
    store.saveResource('pipeline:last-outcome', { outcome: result.outcome, diagnostics: result.diagnostics, operation: options.operation ?? 'recalculate' }, now);
    store.run(runId, 'success', { revision, movies: movies.length, review: data.review, sources: data.sources,
      outcome: result.outcome, diagnostics: result.diagnostics }, true);
    if (options.publish !== false) {
      const publicationRoot = resolvePublicationRoot(options.publicationRoot);
      for (const issue of store.issues().filter(issue => issue.details.decision)) {
        const observation = issue.details.observation;
        publicDecisions.push({ entity: observation?.kind === 'venue' ? 'cinema' : observation?.kind === 'listing' || issue.subject.startsWith('metadata:') ? 'movie' : 'pipeline',
          subject: observation?.data?.title || observation?.data?.name || issue.details.listing?.title || issue.title,
          provider: issue.details.decision.response?.provider || 'decision model', action: issue.status === 'open' ? 'needs-review' : 'decision-recorded', details: issue.details });
      }
      publishWithRollback(store, data, revision, () => { if (options.audit !== false) recordAudit({ movies: data.movies as any, snapshotAt: now, mode: 'scrape',
        inputs: batchesForAudit(store), decisions: publicDecisions,
        cinemaAliases: Object.fromEntries([...venues.entries()].map(([subject, e]) => [store.head(subject)!.data.name, e.name])) }, path.join(publicationRoot, 'public/audit')); }, publicationRoot);
    } else store.flush();
    return data;
  } catch (error) {
    const result: PublicationResult = error instanceof PipelineRunFailure ? error.result : { schemaVersion: 1, outcome: 'fatal', snapshot: store.snapshot(),
      diagnostics: [...diagnostics, failureDiagnostic('processing', 'processing-failed', (error as Error).message,
        'Previous publication is preserved; repair the operation and retry.')] };
    result.diagnostics = runDiagnostics(result.diagnostics);
    store.saveResource('pipeline:last-outcome', { outcome: result.outcome, diagnostics: result.diagnostics, operation: options.operation ?? 'recalculate' }, now);
    store.run(runId, 'failed', { message: sanitizeAudit((error as Error).message), revision, outcome: result.outcome, diagnostics: result.diagnostics }, true);
    store.flush(); throw new PipelineRunFailure((error as Error).message, result);
  } finally { store.releaseLease(owner); }
}

export function publishWithRollback(store: PipelineStore, data: any, revision: number, audit: () => void, root = resolvePublicationRoot()) {
  parsePublicSnapshot(data);
  const files = ['public/movies.json', 'public/sitemap.xml', 'public/audit/index.json'].map(file => path.join(root, file));
  const previous = files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : null);
  try {
    store.transaction(() => { store.publish(data, revision, data.scrapedAt); writePublicDataset(data, root); audit(); });
  } catch (error) {
    for (const [index, file] of files.entries()) {
      if (previous[index] !== null) { const temporary = `${file}.${process.pid}.rollback`; fs.writeFileSync(temporary, previous[index]!); fs.renameSync(temporary, file); }
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    throw error;
  }
}

// Built once: constructing Intl formatters is expensive and this runs per screening observation.
const BERLIN_CLOCK = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function berlinClock(iso: string): string {
  return BERLIN_CLOCK.format(new Date(iso)).replace(' ', 'T');
}
export function slugify(title: string): string { return normalize(title).replace(/\s+/g, '-'); }
function sourceAlias(observation: Observation, entityId?: string) {
  const data = observation.data;
  const labels = observation.kind === 'venue' ? [data.name]
    : [data.rawTitle, data.title, data.displayTitle, data.originalTitle, data.altTitle];
  return { source: observation.source, subject: observation.subject, url: data.url ?? null, recordId: data.sourceId ?? null,
    entityId, evidenceFingerprint: linkEvidence(observation), ...(observation.provenance ? { provenance: observation.provenance } : {}),
    labels: [...new Set<string>(labels.filter((label): label is string => typeof label === 'string' && !!label.trim()))] };
}
function emptyMovie(): any { return { director: null, cast: null, country: null, year: null, posterUrl: null, altTitle: null,
  originalTitle: null, alternativeTitles: [], tmdbTitle: null, tagline: null, plot: null, runtime: null, rating: null,
  imdbRating: null, imdbVotes: null, allRatings: null, voteCount: null, genres: null, originalLanguage: null,
  trailerUrl: null, imdbId: null, backdropUrl: null, ageRating: null, keywords: [], tmdbFetched: false }; }

function batchesForAudit(store: PipelineStore): any[] {
  const observations = store.observations(undefined, true);
  return [...new Set(observations.map(o => o.source))].map(source => {
    const status = store.resource(`source-status:${source}`)?.data;
    const movies = observations.filter(o => o.source === source && o.kind === 'listing').map(listing => ({ ...listing.data, subject: listing.subject,
      cinemas: observations.filter(o => o.source === source && o.kind === 'venue').map(o => o.data),
      showings: observations.filter(o => o.kind === 'screening' && o.data.listingSubject === listing.subject).map(o => o.data),
    }));
    return { name: source, movies, observedAt: status?.observedAt, status: status?.status ?? 'cached', message: status?.message };
  });
}

export function writePublicDataset(data: any, root = resolvePublicationRoot()) {
  parsePublicSnapshot(data);
  const filename = path.join(root, 'public/movies.json'); const temporary = `${filename}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try { fs.writeFileSync(temporary, JSON.stringify(sanitizeAudit(data))); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const urls = ['https://ovberlin.online/', ...data.movies.map((movie: any) => `https://ovberlin.online/${movie.slug}`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${xmlEscape(url)}</loc><lastmod>${data.scrapedAt.slice(0, 10)}</lastmod></url>`).join('')}</urlset>`;
  fs.writeFileSync(path.join(root, 'public/sitemap.xml'), sitemap);
}
