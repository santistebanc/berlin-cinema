import type { ReviewColumn, ReviewEvidence, ReviewOption } from '../../src/types/review';
import { normalize, Observation, ReviewIssue } from './domain';
import { PipelineStore } from './store';
import { identityConflict } from './resolve';
import { parseLabel, parseMarkers } from './labels';
import { comparisonValue } from '../../src/utils/reviewComparison';

const present = (value: any) => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
const fieldLabels: Record<string, string> = { title: 'Title', rawTitle: 'Original source label', originalTitle: 'Original title', director: 'Director', year: 'Year',
  cast: 'Cast', runtime: 'Runtime (minutes)', country: 'Country', originalLanguage: 'Film language', name: 'Venue', address: 'Address', insideBerlin: 'Inside Berlin',
  websiteUrl: 'Website', cinema: 'Cinema', variant: 'Original screening marker', sessionId: 'Booking session', auditorium: 'Auditorium', date: 'Date', time: 'Time', version: 'Screening version', spokenLanguage: 'Spoken language', subtitled: 'Subtitles',
  subtitleLanguage: 'Subtitle language', projection: 'Projection', edition: 'Edition / cut', context: 'Event context', unknown: 'Unrecognized markers', plot: 'Plot',
  genres: 'Genres', directors: 'All directors', writers: 'Writers', spokenLanguages: 'Spoken languages', productionCountries: 'Production countries',
  productionCompanies: 'Production companies', releaseDate: 'First release date', germanReleaseDate: 'German theatrical release', certifications: 'Regional age ratings',
  homepage: 'Official film website', awards: 'Awards', externalIds: 'External identities', status: 'Release status',
  locationConfidence: 'API text-match score', sourceFilmUrl: 'Source film URL',
  posterUrl: 'Poster', imdbId: 'IMDb identity', rating: 'TMDb rating', voteCount: 'TMDb votes',
  imdbRating: 'IMDb rating', imdbVotes: 'IMDb votes', allRatings: 'Other ratings', ageRating: 'Age rating', trailerUrl: 'Trailer', tagline: 'Tagline' };

function sourceFields(observation: Observation) {
  const data = observation.data;
  const modality = data.modality ?? (observation.kind === 'screening' ? parseMarkers(data.variant ?? '') : parseLabel(data.rawTitle || data.title || '', data.variants ?? []).modality);
  return { ...data, ...modality, title: observation.kind === 'screening' ? parseLabel(data.rawTitle || data.title || '').title : data.title || data.displayTitle || data.rawTitle,
    originalTitle: data.originalTitle, sourceFilmUrl: observation.kind === 'listing' ? data.url : undefined,
    websiteUrl: data.websiteUrl, year: Number(data.year) || null,
    version: modality?.version === 'unknown' ? null : modality?.version };
}
function entityFields(store: PipelineStore, entity: any) {
  const corrections = store.overrides(`entity:${entity.id}`).filter(o => o.action === 'patch').map(o => o.patch?.fields ?? {});
  const fields = { ...entity.data, title: entity.kind === 'venue' ? null : entity.name,
    name: entity.kind === 'venue' ? entity.name : null, ...Object.fromEntries(store.fields(entity.id).map(f => [f.field, f.value])), ...Object.assign({}, ...corrections) };
  if (entity.kind === 'venue' && fields.insideBerlin === false && !corrections.some(p => p.insideBerlin === false)) fields.insideBerlin = null;
  return fields;
}

/** Read-only presentation of recorded evidence. Related records are explicitly unlinked context, never new identity proof. */
export function reviewEvidence(store: PipelineStore, issue: ReviewIssue): ReviewEvidence {
  const d = issue.details; const columns: ReviewColumn[] = [];
  const screening = issue.subject.startsWith('slot:');
  const filmIdentity = issue.type === 'film-match';
  const activeSubjects = filmIdentity ? new Set(store.observations(undefined, true).map(o => o.subject)) : new Set<string>();
  const entityId = issue.subject.startsWith('entity:') ? issue.subject.slice(7) : d.entityId;
  const entity = entityId ? store.entity(entityId) : null;
  const primary = [...(d.observation ? [d.observation] : d.observations ?? []),
    ...[...new Set<string>([entityId, ...(d.entityIds ?? [])].filter(Boolean))].flatMap(id => store.linkedObservations(id))] as Observation[];
  const primaryIds = new Set(primary.map(o => o.id));
  const baseline = d.listing ?? d.parsed ?? entity?.data ?? {};
  const title = baseline.title || entity?.name || primary[0]?.data.rawTitle || primary[0]?.data.name;
  const kind = primary[0]?.kind ?? (entity?.kind === 'venue' ? 'venue' : 'listing');
  const related = title && kind !== 'screening' ? store.observations(undefined, true).filter(o => o.kind === kind && !primaryIds.has(o.id)
    && normalize(o.data.name || parseLabel(o.data.rawTitle || o.data.title || '').title) === normalize(title)
    && !identityConflict(baseline, o.data)).slice(0, 30) : [];
  const candidateSubjects = new Set<string>(filmIdentity ? (d.candidates ?? []).flatMap((candidate: any) => store.linkedObservations(candidate.id).map(o => o.subject)) : []);
  const observations = [...new Map([...primary, ...related.filter(o => !candidateSubjects.has(o.subject))].map(o => [o.id, o])).values()];
  for (const observation of observations) {
    const id = screening ? `entry:${observation.id}` : `source:${observation.source}:${observation.id}`;
    let column = columns.find(c => c.id === id);
    if (!column) { column = { id, label: screening ? `Entry ${columns.length + 1}` : filmIdentity && primaryIds.has(observation.id)
      ? `${observation.source} · current entry` : observation.source,
      description: filmIdentity && primaryIds.has(observation.id) ? 'The entry being resolved' : undefined,
      source: observation.source, kind: 'source', fields: {}, records: [] }; columns.push(column); }
    column.records.push({ id: observation.id, url: observation.data.url, observedAt: observation.observedAt, related: !primaryIds.has(observation.id),
      label: observation.data.rawTitle || observation.data.name || observation.data.cinema });
    for (const [key, value] of Object.entries(sourceFields(observation))) if (present(value)) {
      const values = column.fields[key] ?? []; if (!values.some(v => JSON.stringify(v) === JSON.stringify(value))) values.push(value); column.fields[key] = values;
    }
  }
  if (entityId) {
    // Accepted enrichment retains its own provider column instead of masquerading as a cinema-source value.
    for (const field of store.fields(entityId).filter(field => /^(TMDb:|OMDb:|manual$)/.test(field.source))) {
      const id = `provenance:${field.source}`; let column = columns.find(c => c.id === id);
      if (!column) {
        const [provider, externalId] = field.source.split(':');
        const resource = externalId ? store.resource(provider === 'TMDb' ? `tmdb-enrichment:${externalId}` : `omdb:${externalId}`) : null;
        const raw = resource?.data ?? {};
        const data = provider === 'TMDb' ? { ...raw, title: raw.tmdbTitle, year: raw.releaseYear } : { ...raw, allRatings: raw.ratings };
        column = { id, label: field.source === 'manual' ? 'Manual correction' : `${provider} · accepted ${externalId}`, kind: 'source',
          fields: Object.fromEntries(Object.entries(data).filter(([, value]) => present(value)).map(([key, value]) => [key, [value]])),
          records: [{ id: field.source, observedAt: resource?.fetchedAt ?? field.observedAt,
            url: provider === 'TMDb' ? `https://www.themoviedb.org/movie/${externalId}` : provider === 'OMDb' ? `https://www.imdb.com/title/${externalId}/` : undefined }] };
        columns.push(column);
      }
      if (present(field.value) && !column.fields[field.field]?.length) column.fields[field.field] = [field.value];
    }
  }
  if (entity) columns.push({ id: 'current', label: 'Current record', kind: 'current', records: [],
    fields: Object.fromEntries(Object.entries(entityFields(store, entity)).filter(([, v]) => present(v)).map(([k, v]) => [k, [v]])) });
  if (entity?.data.locationEvidence?.source === 'Geoapify') columns.push({ id: 'geoapify:location', label: 'Geoapify · address / boundary', kind: 'source',
    fields: { address: [entity.data.address], insideBerlin: [entity.data.insideBerlin] },
    records: [{ id: entity.data.geoapifyPlaceId, url: 'https://www.geoapify.com/', observedAt: entity.data.locationEvidence.fetchedAt }] });
  for (const candidate of d.candidates ?? []) {
    const known = typeof candidate.id === 'string' ? store.entity(candidate.id) ?? candidate : candidate;
    const data = known.kind ? entityFields(store, known) : { ...known, plot: known.overview };
    const isMetadata = issue.subject.startsWith('metadata:');
    const linked = filmIdentity ? store.linkedObservations(String(candidate.id)) : [];
    const urls: string[] = [...new Set<string>([...(known.data?.sourceUrls ?? []), ...linked.map(o => o.data.url)].filter(Boolean))];
    const sources = [...new Set<string>([...linked.map(o => o.source), ...urls.map(url => {
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
    })].filter(Boolean))];
    const earlier = linked.length > 0 && linked.every(o => !activeSubjects.has(o.subject));
    const label = filmIdentity ? `${sources.join(' / ') || 'Stored film'} · ${earlier ? 'earlier' : 'existing'} record` : isMetadata ? `TMDb · ${candidate.year ?? 'year unknown'}` : candidate.name || candidate.title;
    columns.push({ id: `candidate:${candidate.id}`, kind: 'candidate', accepted: d.selectedId === candidate.id || entity?.data.tmdbId === candidate.id,
      label, description: filmIdentity ? `Candidate ${columns.filter(c => c.kind === 'candidate').length + 1} · ${known.name || candidate.name} · not linked to this entry` : undefined,
      records: filmIdentity ? urls.map(url => ({ id: `${candidate.id}:${url}`, url,
        observedAt: linked.find(o => o.data.url === url)?.observedAt })) : [{ id: String(candidate.id), url: isMetadata ? `https://www.themoviedb.org/movie/${candidate.id}` : candidate.data?.websiteUrl }],
      fields: { ...Object.fromEntries(Object.entries(data).filter(([, v]) => present(v)).map(([k, v]) => [k, [v]])), ...(filmIdentity ? { sourceFilmUrl: urls } : {}) } });
  }
  for (const candidate of d.geocoding?.candidates ?? []) {
    if (candidate.category !== 'entertainment.cinema') continue;
    columns.push({ id: `geoapify-result:${candidate.placeId}`, label: `Geoapify · ${candidate.name || 'Cinema result'}`, kind: 'candidate',
      records: [{ id: candidate.placeId, observedAt: d.geocoding.fetchedAt,
        url: `https://www.openstreetmap.org/?mlat=${candidate.latitude}&mlon=${candidate.longitude}#map=18/${candidate.latitude}/${candidate.longitude}` }],
      fields: { name: [candidate.name], ...(candidate.address ? { address: [candidate.address] } : {}),
        ...(typeof candidate.insideBerlin === 'boolean' ? { insideBerlin: [candidate.insideBerlin] } : {}), locationConfidence: [candidate.confidence] } });
  }
  const metadata = issue.subject.startsWith('metadata:');
  const venue = kind === 'venue' || entity?.kind === 'venue';
  const required = venue ? ['name', 'address', 'insideBerlin'] : screening ? ['title', 'cinema', 'date', 'time', 'version', 'subtitleLanguage']
    : filmIdentity ? ['title', 'sourceFilmUrl', 'year', 'director'] : ['title', 'director', 'year'];
  const screeningFields = [...required, 'spokenLanguage', 'projection', 'edition', 'context', 'unknown', 'sessionId', 'auditorium'];
  const fields = [...new Set([...required, ...Object.keys(fieldLabels)])].filter(key => required.includes(key) || columns.some(c => c.fields[key]?.length))
    .map(key => ({ key, label: screening ? ({ title: 'Film', version: 'Version', subtitleLanguage: 'Subtitles' } as Record<string, string>)[key] || fieldLabels[key] : fieldLabels[key],
      secondary: key === 'locationConfidence' || (screening ? !screeningFields.includes(key) : filmIdentity
        ? ![...required, 'country', 'runtime', 'cast'].includes(key) : metadata && !['title', 'director', 'year', 'originalTitle', 'cast', 'runtime', 'country'].includes(key)) }));
  const reasons: ReviewEvidence['reasons'] = []; const checks: ReviewEvidence['checks'] = [];
  const add = (code: string, title: string, detail: string) => reasons.push({ code, title, detail });
  if (d.resolutionCode === 'compatible-descriptions') add('compatible-descriptions', 'Compatible descriptions combined automatically', d.resolution);
  if (d.resolutionCode === 'verified-venue-address') add('verified-venue-address', 'Cinema address verified by name', d.resolution);
  if (filmIdentity) {
    const source = primary[0]?.data ?? {};
    const samePage = columns.filter(c => c.kind === 'candidate' && c.fields.sourceFilmUrl?.includes(source.url));
    const sameTitle = samePage.some(c => c.fields.title?.some(title => normalize(title) === normalize(d.parsed?.title || source.title || '')));
    if (samePage.length) add('shared-source-page', 'An existing record uses the same source film URL',
      sameTitle ? 'The matching page is highlighted in the table. The recorded checks did not choose one unique identity despite the shared page. Compare the candidate records before linking.'
        : 'The matching page is highlighted in the table. The current identity rule also requires an exact main-title match; the recorded title variation did not pass that rule. This is a rule limitation, not proof of two different films.');
    const missing = ['year', 'director'].filter(key => !present(key === 'year' ? d.parsed?.year ?? source.year : source[key]));
    if (missing.length) add('missing-data', 'Year or director evidence is missing',
      `The current source entry has no extracted ${missing.join(' or ')}. Those fields cannot distinguish remakes or corroborate the other source’s film. Missing values are not contradictions.`);
    if (!samePage.length) add('identity-rule-unresolved', 'The identity rule did not establish one matching film',
      'Similar titles retrieve candidates, but the recorded title, source page, year and director evidence did not establish one identity. Compare each candidate separately below.');
  }
  if (metadata && issue.type === 'metadata-match') {
    const matchesField = (candidate: any, key: string) => key === 'title'
      ? [d.listing?.title, ...(d.listing?.titles ?? [])].filter(Boolean).some(title => [candidate.title, candidate.originalTitle].filter(Boolean).some(other => normalize(title) === normalize(other)))
      : normalize(String(candidate[key] ?? '')) === normalize(String(d.listing?.[key] ?? ''));
    for (const key of ['title', 'director', 'year']) {
      const value = d.listing?.[key];
      const agrees = (d.candidates ?? []).some((c: any) => matchesField(c, key));
      checks.push({ label: fieldLabels[key], status: !present(value) ? 'missing' : agrees ? 'passed' : 'conflict',
        detail: !present(value) ? `${fieldLabels[key]} was not available to the resolver.` : agrees ? 'Matches at least one supplied candidate.' : 'Does not exactly match a supplied candidate.' });
    }
    const missing = checks.filter(c => c.status === 'missing').map(c => c.label.toLowerCase());
    if (missing.length) add('missing-data', 'The automatic rule lacks required evidence', `Missing ${missing.join(' and ')} in the resolver input. This means it was not extracted; the original page may still contain it.`);
    if (checks.some(c => c.status === 'conflict')) add('conflicting-data', 'Source and database values disagree', 'The exact title, year and director rule did not establish a matching candidate. Compare the highlighted values.');
    if (checks.every(c => c.status === 'passed')) {
      const exact = (d.candidates ?? []).filter((candidate: any) => ['title', 'director', 'year'].every(key => matchesField(candidate, key)));
      if (exact.length > 1) add('nonunique-match', 'More than one candidate matches the required fields', 'The rule requires one unique film. The shared title, director and year did not distinguish these database records.');
      else if (!exact.length) add('no-joint-match', 'No single candidate matches all required fields', 'Individual fields match different candidates, but no candidate matches the complete title, director and year together.');
    }
    if (!(d.candidates ?? []).length) add('no-candidates', 'No eligible database candidate was recorded', 'The lookup returned no usable candidate, or candidates were excluded by identity checks. A request failure is reported separately when recorded.');
  }
  for (const failure of d.retrievalErrors ?? []) add('verification-api-failed', 'Database verification request failed', `${failure.reason}${failure.route ? ` (${failure.route})` : ''}. Results may be incomplete.`);
  const decision = d.decision;
  if (decision) {
    const code = decision.code || (/No decision provider configured/.test(decision.reason) ? 'provider-not-configured'
      : /below acceptance threshold/.test(decision.reason) ? 'low-confidence' : /budget exhausted/.test(decision.reason) ? 'budget-exhausted'
      : /exceeds.*limit/.test(decision.reason) ? 'input-too-large' : decision.accepted ? 'accepted' : decision.response ? 'low-confidence' : 'unclassified');
    const descriptions: Record<string, [string, string]> = {
      'provider-not-configured': ['The decision model was not configured', 'No model assessed this item. The automatic rule could not resolve it and no provider credentials were available.'],
      'low-confidence': ['Model confidence was too low', 'At least one answer fell below the required confidence or chosen-option probability. Its values are shown below.'],
      'budget-exhausted': ['The model spending limit was reached', 'The model call was skipped to keep spending within the configured limit.'],
      'input-too-large': ['Too much evidence for the bounded model request', 'The model call was skipped because the evidence exceeded the configured input limit.'],
      'provider-error': ['The decision API failed', decision.reason],
      'invalid-response': ['The model returned an invalid response', 'The output failed choice/probability validation and was not accepted.'],
      'unclassified': ['An older decision failure was recorded', decision.reason || 'The run did not record a structured failure reason. Recalculate to obtain current diagnostics.'],
    };
    if (descriptions[code]) add(code, ...descriptions[code]);
    else if (Object.values(decision.response?.answers ?? {}).some((a: any) => a.choice === 'insufficient')) add('model-abstained', 'The model could not establish a match', 'It explicitly selected insufficient evidence; it did not choose a candidate.');
    else if (Object.values(decision.response?.answers ?? {}).some((a: any) => a.choice === 'different')) add('model-no-match', 'The model rejected the supplied identity candidates', 'It selected a distinct work rather than any supplied candidate. Choosing “none” preserves source information without accepting their enrichment.');
    else if (issue.status === 'caution') add('accepted-with-caution', 'Automation selected a result for inspection', 'The recorded decision passed its acceptance checks. This item is retained for review because it needed model judgement.');
  }
  if (issue.type === 'venue-location') add('location-unverified', 'Berlin location has not been established', 'No accepted Berlin venue/address evidence was recorded for this source. Choose a verified venue or confirm its address and Berlin eligibility.');
  for (const item of primary) {
    const address = item.data?.addressEvidence;
    if (address?.status && address.status !== 'resolved') add(`source-address-${address.status}`, address.status === 'deferred' ? 'Source address retrieval was deferred'
      : address.status === 'parse-failed' ? 'The source venue address could not be parsed' : 'The source venue detail request failed', address.reason || 'No usable address was extracted from the source detail page.');
  }
  if (d.geocoding && d.geocoding.status !== 'resolved') add(`geocoding-${d.geocoding.status}`, d.geocoding.status === 'request-failed' ? 'The Geoapify verification request failed'
    : d.geocoding.status === 'not-configured' ? 'Geoapify was not configured for this run' : d.geocoding.status === 'boundary-unavailable' ? 'Berlin boundary membership could not be verified'
      : d.geocoding.status === 'budget-exhausted' ? 'The Geoapify application limit was reached' : d.geocoding.status === 'offline' ? 'Place lookup was offline'
        : 'Geoapify did not establish a unique precise place match', d.geocoding.reason);
  if (issue.type === 'unknown-marker' || issue.type === 'label-interpretation') add('rule-not-covered', 'The label is not fully covered by parsing rules', 'An annotation could not be classified safely as title, language, format, edition or event context.');
  if (issue.type === 'correction-conflict') add('changed-evidence', 'New evidence conflicts with a saved correction', 'The old correction was not reapplied automatically. Compare the new source evidence before replacing it.');
  if ((issue.type === 'metadata-conflict' || issue.type === 'source-identity-changed' || issue.type === 'venue-identity-changed') && d.resolutionCode !== 'verified-venue-address')
    add('conflicting-data', 'New evidence contradicts the previous identity', d.reason || 'The source year, director or physical address changed or disagreed with the selected identity. Its incompatible data was not accepted automatically.');
  if (issue.type === 'provider-configuration') add('provider-not-configured', 'The decision model is not configured', d.reason || 'Configure a provider to enable model decisions. Rules and manual corrections still work.');
  if (issue.type === 'legacy-evidence') add('legacy-data', 'Older enrichment has not been verified by the new resolver', d.reason || 'Historical data was retained for inspection without promoting old inferred identities to verified facts.');
  if (issue.type === 'source-unavailable') add('source-unavailable', 'A source or verification service was unavailable', d.reason || 'The recorded retrieval failed; previous usable evidence was retained.');
  if (!reasons.length) add(issue.type === 'field-review' ? 'manual-review' : 'unresolved-rule', issue.type === 'field-review' ? 'This record was opened for manual inspection' : 'The recorded evidence did not establish a unique resolution',
    d.reason || 'This run recorded no more specific failure reason. The evidence and original decision are available below.');

  const options: ReviewOption[] = [];
  if (metadata) {
    for (const c of d.candidates ?? []) options.push({ id: `metadata:${c.id}`, action: 'metadata', targetId: String(c.id), values: { tmdbId: c.id },
      label: `${c.title} · ${c.year ?? 'year unknown'}`, description: `${c.director || 'Director unknown'} · Use this film’s database metadata.` });
    options.push({ id: 'metadata:none', action: 'metadata', targetId: 'none', values: { tmdbId: null }, label: 'None of these films', description: 'Keep source information and do not import metadata from these candidates.' });
  } else if (screening) {
    for (const [index, modality] of (d.alternatives ?? []).entries()) {
      const description = [comparisonValue(modality.version, 'version'), modality.subtitleLanguage
        ? `${comparisonValue(modality.subtitleLanguage, 'subtitleLanguage')} subtitles` : modality.subtitled === true
          ? 'subtitles, language unspecified' : modality.subtitled === false ? 'no subtitles' : '', ...(modality.projection ?? []), modality.edition].filter(Boolean).join(' · ');
      options.push({ id: `screening:${index}`, action: 'screening', values: { mode: 'same', modality },
        label: `One screening · ${description}`, description: 'Keep one screening using these properties.' });
    }
  } else if (primary[0] && ['listing', 'venue'].includes(primary[0].kind)) {
    for (const c of d.candidates ?? []) {
      const column = columns.find(column => column.id === `candidate:${c.id}`);
      options.push({ id: `link:${c.id}`, action: 'link', targetId: c.id,
        label: filmIdentity ? `Same film as ${column?.label || c.name}` : c.name || c.title,
        description: filmIdentity ? `${column?.description || c.name}. Link the current entry to this record.`
          : [c.data?.year, c.data?.director, c.data?.address].filter(Boolean).join(' · ') || 'Link this source to this existing identity.' });
    }
    if (primary[0].kind === 'listing') options.push({ id: 'separate', action: 'separate', label: 'Keep as a separate film / programme', description: 'Do not merge this source listing with any supplied candidate.' });
  }
  if (venue && entityId) options.push(
    { id: 'location:inside', action: 'fields', values: { insideBerlin: true }, label: 'Confirm inside Berlin', description: 'Include this physical venue’s screenings. Supply the address as a custom correction if it is missing.' },
    { id: 'location:outside', action: 'fields', values: { insideBerlin: false }, label: 'Confirm outside Berlin', description: 'Exclude this physical venue’s screenings from the Berlin listings.' });
  options.push({ id: 'dismiss', action: 'dismiss', label: 'Mark reviewed; keep the current result', description: 'Acknowledge this item without changing facts, linking a candidate or accepting metadata.' });
  return { layout: screening ? 'screening' : filmIdentity ? 'identity' : undefined, columns, fields, reasons, checks, options,
    question: issue.type === 'provider-configuration' ? 'Model decisions are unavailable until a provider is configured.' : issue.type === 'source-unavailable' ? 'A retrieval service could not provide fresh evidence for this run.'
      : metadata ? 'Which database film, if any, is the film listed by these sources?' : venue ? 'Which physical cinema is this, and is it inside Berlin?' : screening ? 'Which description should this viewing use?'
        : filmIdentity ? 'Is the current source entry the same film as one of these existing records?' : 'Which interpretation or identity is supported by the source evidence?',
    impact: ['compatible-descriptions', 'same-viewing'].includes(d.resolutionCode) ? 'One screening is published with the combined known properties. No manual action is needed.'
      : d.resolutionCode === 'verified-venue-address' ? 'The API-verified cinema address and state boundary determine the published location and Berlin eligibility. No manual action is needed.'
        : metadata ? entity?.data.tmdbId ? 'An accepted database identity supplies enrichment. Your resolution can keep or replace that identity.' : 'Unverified database enrichment is withheld. Source-provided listings can remain visible.' : venue ? 'Unverified Berlin locations are excluded. Saved location decisions control inclusion.' : screening ? 'One viewing is published. Contradictory description details remain unspecified unless corrected.' : 'Source records remain separate or uncertain until enough evidence supports a resolution.',
    rule: metadata ? 'Automatic metadata acceptance requires a unique candidate supported by complete titles and director credits, independent year/cast evidence, or a verified external identity. Model confidence alone cannot establish identity.' : venue ? 'An established venue link, compatible verified venue, or exact source address in Berlin OSM evidence can resolve the location.' : screening ? 'The same film, cinema, date and time identify one viewing. Description differences never split it or require a model decision.' : 'Explicit parsing rules and supporting identity evidence run first. Similarity retrieves candidates and does not establish identity.',
    metrics: Object.entries(decision?.response?.answers ?? {}).map(([question, answer]: any) => ({ question, choice: answer.choice, confidence: answer.confidence,
      probability: answer.probabilities?.[answer.choice], threshold: decision.threshold ?? null })) };
}
