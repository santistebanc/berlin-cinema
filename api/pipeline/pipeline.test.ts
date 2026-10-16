import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import TmdbClient, { tmdbMovieData } from '../tmdb-client';
import { PipelineStore } from './store';
import { DecisionEngine, HttpDecisionModel, validateAnswers } from './decision-model';
import { DecisionModel, DecisionRequest, DecisionResponse, SourceBatch, emptyModality, fingerprint, identity } from './domain';
import { parseLabel, parseMarkers, modalityTags, programmeRule } from './labels';
import { adaptBatch, observation } from './observations';
import { runPipeline, berlinClock, publishWithRollback } from './pipeline';
import { flag, identityConflict, IdentityResolver, interpret, linkEvidence, venueAddressConflict } from './resolve';
import { venueAddressesMatch, osmStreetPattern } from './addresses';
import { applyReview, previewReview, ReviewConflict } from './review';
import { reviewEvidence } from './review-evidence';
import { comparisonStatus, comparisonValue, screeningSubtitles } from '../../src/utils/reviewComparison';
import { resolveScreenings } from './screenings';
import { createAdminServer } from '../../scripts/admin';
import { labelFixtures } from '../../pipeline/evaluation-fixtures';
import { fillSourceDetails, parseSourceDetails, refreshListingObservations } from './source-details';
import { fillVenueDetails, parseVenueDetails } from './source-venues';
import { berlinBoundary, GeoapifyGeocoder, geoNameMatches } from './geocoding';
import { currentSnapshot } from '../../src/utils/liveSnapshot';
import { matchesFilters } from '../../src/utils/cinemaUtils';
import { CachedFilmEvidence, sameFilmWithDifferentYear, sharedDirector, supportsFilmIdentity } from './identity-evidence';
import { filmDisplayGroups } from './film-groups';
import { consolidateVenues } from './venue-groups';

const NOW = '2026-10-15T10:00:00Z';
function raw(title = 'A Film', year: string | null = '2026', extras: any = {}) {
  return { rawTitle: title, title, year, director: 'Director A', cast: ['Actor A'], country: 'DE',
    url: `https://example.test/movie/${title}`, variants: ['OV'],
    cinemas: [{ name: 'Example Cinema', address: 'Example Straße 1, 10115 Berlin' }],
    showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: '20:00', url: 'https://example.test/cinema/1' }], ...extras };
}
function batch(source: string, movies = [raw()], extras: Partial<SourceBatch> = {}): SourceBatch {
  return { source, movies, observedAt: NOW, status: 'fresh', complete: true, ...extras };
}
const osm = [{ id: 'node/1', name: 'Example Cinema', address: 'Example Straße 1', website: 'https://cinema.example', insideBerlin: true }];
function answer(request: DecisionRequest, choice: string, confidence = 0.99): DecisionResponse {
  return { provider: 'fixture', model: 'fixture', inputTokens: 100,
    answers: Object.fromEntries(Object.entries(request.questions).map(([name, q]) => [name, {
      choice, confidence, probabilities: Object.fromEntries(Object.keys(q.choices).map(option => [option, option === choice ? 1 : 0])),
    }])) };
}
function model(pick: (request: DecisionRequest) => string): DecisionModel {
  return { provider: 'fixture', model: 'fixture', inputUsdPerMillion: 0.038, decide: async request => answer(request, pick(request)) };
}
const execute = (store: PipelineStore, batches?: SourceBatch[], extra: any = {}) => runPipeline({ store, batches, now: NOW, network: false,
  model: null, tmdb: null, osm, publish: false, audit: false, ...extra });

async function main() {
  let checks = 0;
  for (const fixture of labelFixtures) {
    const parsed = parseLabel(fixture.input);
    assert.equal(parsed.title, fixture.title); assert.equal(parsed.year, fixture.year);
    assert.deepEqual(modalityTags(parsed.modality).sort(), [...fixture.tags].sort()); checks++;
  }
  assert.equal(parseLabel('A Film (OmU)').modality.subtitleLanguage, null, 'OmU does not identify subtitle language');
  assert.equal(parseMarkers('DFmEnglU')!.spokenLanguage, 'de');
  for (const title of ['Kurzfilm(e)', 'Kurzfilm (e)', 'Filmreihe(n)', 'Shorts Attack - Kurzfilm(e)', 'Vaiana (Live Action)']) {
    const parsed = parseLabel(`${title} (OmU)`);
    assert.equal(parsed.title, title); assert.deepEqual(parsed.ambiguous, []);
    assert.deepEqual(modalityTags(parsed.modality), ['OmU']);
  }
  assert.equal(parseLabel('Bernd - Operation Germanenkind').kind, 'film');
  assert.equal(programmeRule('A Night at the Opera'), null);
  assert.equal(programmeRule('Festival'), null);
  assert.equal(programmeRule('Sneakers'), null);
  for (const title of ['Street Fighter', 'Verity - Dunkle Geheimnisse']) {
    const parsed = parseLabel(`${title} (PLF 2D, OV)`);
    assert.equal(parsed.title, title); assert.deepEqual(parsed.ambiguous, []);
    assert.deepEqual(modalityTags(parsed.modality), ['OV', 'PLF 2D']);
  }
  assert.deepEqual(parseLabel('A Film (Unknown format)').ambiguous, ['Unknown format']); checks += 12;
  assert.equal(venueAddressConflict('Kantstr. 10, Berlin', 'Kantstraße 12a'), true);
  assert.equal(venueAddressConflict('Kantstr. 10, Berlin', 'Kantstraße 10'), false); checks += 2;
  assert.equal(venueAddressesMatch('Rosenthaler Str. 40–41, 10178 Berlin - Mitte', 'Rosenthaler Straße 40/41, 10178 Berlin'), true);
  assert.equal(venueAddressesMatch('Kantstr. 10 a, 10623 Berlin', 'Kantstraße 10a'), true);
  assert.equal(venueAddressesMatch('Kantstr. 10', 'Kantstraße 10a'), false);
  assert.equal(venueAddressesMatch('Rosenthaler Str. 40, 10178 Berlin', 'Rosenthaler Straße 40/41'), false);
  assert.equal(venueAddressesMatch('Same Straße 1, 10115 Berlin', 'Same Straße 1, 14467 Potsdam'), false);
  assert.equal(venueAddressConflict('Kantstr. 10', 'Other Straße 10'), true);
  assert.ok(osmStreetPattern('Rosenthaler Str. 40/41, 10178 Berlin')?.includes('straße|strasse')); checks += 7;
  assert.equal(venueAddressesMatch('Steinstr. 19, 14776 Brandenburg - Umland', 'Steinstraße 19, 14776 Brandenburg an der Havel'), true, 'A shortened city name is compatible with its full name when postcode, street and house number agree');
  assert.equal(venueAddressesMatch('Steinstr. 19, 14776 Brandenburg', 'Steinstraße 19, 14542 Brandenburg an der Havel'), false);
  assert.equal(venueAddressesMatch('Steinstr. 19, Brandenburg', 'Steinstraße 19, 14776 Brandenburg an der Havel'), true);
  assert.equal(venueAddressesMatch('Steinstr. 19, 14776 Berlin', 'Steinstraße 19, 14776 Brandenburg an der Havel'), false); checks += 4;
  assert.equal(venueAddressConflict('Steinstr. 19, 14776 Brandenburg', 'Steinstraße 19, 14776 Brandenburg an der Havel'), false, 'Accepted spelling/city normalization cannot reopen an address-change flag'); checks++;
  {
    const venues = new PipelineStore(':memory:');
    const building = { insideBerlin: true, geoapifyPlaceId: 'shared-building', locationEvidence: { identityEstablished: false,
      matchedAddress: 'Example Street 1, 10115 Berlin', boundary: { isoCode: 'DE-BE' }, fetchedAt: NOW } };
    const firstVenue = { id: 'venue-a', kind: 'venue' as const, name: 'Lichtblick-Kino', data: { ...building, address: building.locationEvidence.matchedAddress } };
    const secondVenue = { ...firstVenue, id: 'venue-b', name: 'Lichtblick' };
    venues.saveEntity(firstVenue); venues.saveEntity(secondVenue);
    assert.equal(new Set([...consolidateVenues(venues, new Map([['a', firstVenue], ['b', secondVenue]])).values()].map(e => e.id)).size, 1,
      'Compatible full-word venue aliases at the same independently verified full address/place should publish as one cinema'); checks++;
    const differentVenue = { ...secondVenue, id: 'venue-c', name: 'Different Cinema' };
    assert.equal(new Set([...consolidateVenues(venues, new Map([['a', firstVenue], ['b', differentVenue]])).values()].map(e => e.id)).size, 2,
      'A shared building alone does not establish a shared cinema'); checks++;
    const otherBranch = { ...secondVenue, id: 'venue-d', data: { ...secondVenue.data, address: 'Example Street 2, 10115 Berlin' } };
    assert.equal(new Set([...consolidateVenues(venues, new Map([['a', firstVenue], ['b', otherBranch]])).values()].map(e => e.id)).size, 2,
      'Even matching labels and place IDs cannot override a conflicting house number'); checks++;
    const protectedListing = observation('b', 'venue', 'lichtblick', { name: secondVenue.name, address: secondVenue.data.address }, NOW);
    venues.observe(protectedListing); venues.saveLink(protectedListing.subject, secondVenue.id, linkEvidence(protectedListing), 'venue-evidence');
    venues.addOverride({ subject: protectedListing.subject, action: 'separate', targetId: firstVenue.id, evidenceFingerprint: linkEvidence(protectedListing), actor: 'test', reason: 'Keep these locations separate' });
    assert.equal(new Set([...consolidateVenues(venues, new Map([['a', firstVenue], ['b', secondVenue]])).values()].map(e => e.id)).size, 2,
      'Publication respects manual cinema separations'); checks++;
    const renamedStore = new PipelineStore(':memory:');
    renamedStore.saveResource('geoapify:venue:alias', { candidates: [{ placeId: 'cinema-poi', name: 'UCI Luxe East Side Gallery',
      address: firstVenue.data.address, insideBerlin: true, category: 'entertainment.cinema', boundary: { isoCode: 'DE-BE' },
      raw: { name: 'UCI Luxe East Side Gallery', other_names: { short_name: 'UCI;UCI Luxe' } } }] }, NOW);
    const renamedA = { ...firstVenue, name: 'UCI Luxe Mercedes Platz' };
    const renamedB = { ...secondVenue, name: 'UCI Kinowelt Berlin - East Side Gallery | Luxe' };
    assert.equal(new Set([...consolidateVenues(renamedStore, new Map([['a', renamedA], ['b', renamedB]]), NOW).values()].map(e => e.id)).size, 1,
      'Different venue labels can independently validate the same cinema POI through official aliases and the full address'); checks++;
    const sourceRange = 'Example Street 1-3, 10115 Berlin';
    const cinemaPoint = { ...firstVenue, name: 'Passage', data: { ...firstVenue.data, geoapifyPlaceId: 'cinema-point',
      locationEvidence: { ...building.locationEvidence, identityEstablished: true, sourceAddress: sourceRange } } };
    const cinemaBuilding = { ...secondVenue, name: 'Passage Kinos', data: { ...secondVenue.data, address: sourceRange,
      locationEvidence: { ...building.locationEvidence, matchedAddress: sourceRange, sourceAddress: sourceRange } } };
    assert.equal(new Set([...consolidateVenues(new PipelineStore(':memory:'), new Map([['a', cinemaPoint], ['b', cinemaBuilding]])).values()].map(e => e.id)).size, 1,
      'Exact retained source addresses and a verified cinema identity can reconcile a building range with its cinema point'); checks++;
    const publicationStore = new PipelineStore(':memory:');
    const venueBatches = ['a', 'b'].map((source, index) => {
      const venue = index ? secondVenue : firstVenue;
      const input = batch(source, [raw('A Film', '2026', { cinemas: [{ name: venue.name, address: venue.data.address }],
        showings: [{ cinema: venue.name, date: '2026-10-16', time: '20:00', url: `https://example.test/${source}` }] })]);
      const item = adaptBatch(input).find(o => o.kind === 'venue')!;
      publicationStore.observe(item); publicationStore.saveEntity(venue);
      publicationStore.saveLink(item.subject, venue.id, linkEvidence(item), 'venue-evidence'); return input;
    });
    const combined = await execute(publicationStore, venueBatches, { osm: [], geocoder: null });
    assert.equal(combined.movies[0].cinemas.length, 1);
    assert.deepEqual(combined.movies[0].cinemas[0].sourceAliases.map((alias: any) => [alias.source, alias.labels[0]]).sort(),
      [['a', 'Lichtblick-Kino'], ['b', 'Lichtblick']], 'Cinema names stay associated with the source records that supplied them'); checks++;
    const combinedScreenings = combined.movies[0].showings['2026-10-16']['20:00'];
    assert.equal(combinedScreenings.length, 1); assert.equal(combinedScreenings[0].observationIds.length, 2,
      'Consolidating cinema aliases reconciles their screenings while retaining both source records'); checks += 3;
    publicationStore.publish(combined, publicationStore.revision, NOW);
    const oneVenueSource = await execute(publicationStore, [batch('a', []), venueBatches[1]], { osm: [], geocoder: null });
    assert.equal(oneVenueSource.movies[0].cinemas[0].id, combined.movies[0].cinemas[0].id,
      'A previously resolved cinema alias retains its canonical identity when the other source withdraws'); checks++;
    const noVenueSources = await execute(publicationStore, [batch('a', []), batch('b', [])], { osm: [], geocoder: null });
    publicationStore.publish(noVenueSources, publicationStore.revision, NOW);
    const returningVenue = await execute(publicationStore, [venueBatches[1]], { osm: [], geocoder: null });
    assert.equal(returningVenue.movies[0].cinemas[0].id, combined.movies[0].cinemas[0].id,
      'A cinema source alias remains known after it disappears from the published snapshot'); checks++;
    const venueSubject = adaptBatch(venueBatches[1]).find(item => item.kind === 'venue')!;
    publicationStore.addOverride({ subject: venueSubject.subject, action: 'separate', targetId: combined.movies[0].cinemas[0].id,
      evidenceFingerprint: linkEvidence(venueSubject), actor: 'test', reason: 'Separate a saved cinema alias' });
    const unmergedVenues = await execute(publicationStore, venueBatches, { osm: [], geocoder: null });
    assert.equal(unmergedVenues.movies[0].cinemas.length, 2, 'A saved cinema alias cannot bypass a later manual separation'); checks++;
  }
  assert.ok(identityConflict({ year: 1980 }, { year: 2026 }));
  assert.ok(identityConflict({ verifiedImdbId: 'tt1' }, { verifiedImdbId: 'tt2' }));
  assert.equal(berlinClock('2026-10-25T01:30:00Z'), '2026-10-25T02:30', 'Use Europe/Berlin through DST changes');
  const details = parseSourceDetails('<dl><dt>Regie:</dt><dd>A Director</dd><dt>Jahr:</dt><dd>2026</dd><dt>Länge:</dt><dd>111 min</dd></dl>');
  assert.deepEqual(details, { director: 'A Director', year: 2026, runtime: 111 }); checks++;
  assert.equal(sharedDirector({ director: 'Yoshitoshi Shinomiya' }, { director: 'Shinomiya Yoshitoshi' }), true);
  assert.equal(sharedDirector({ director: 'Paweł Pawlikowski' }, { director: 'Pawel Pawlikowski' }), true);
  assert.equal(sharedDirector({ director: 'Charlie Chaplin' }, { director: 'Charles Chaplin' }), false, 'Unverified nicknames are not interchangeable');
  assert.equal(supportsFilmIdentity({ title: 'Camouflage', director: 'Andreas Kessler' },
    { title: 'Camouflage', directors: ['Stephan Kämpf', 'Andreas Kessler'], year: 2014 }), true, 'A complete title and credited director support identity without inventing a missing year');
  assert.equal(supportsFilmIdentity({ title: 'Queen Budapest', director: 'Med Hondo' },
    { title: 'Jim Queen', director: 'Another Director' }), false, 'Partial names never establish identity');
  const yearSource = { title: 'Metropolis', year: 1925, director: 'Fritz Lang', cast: ['Brigitte Helm', 'Alfred Abel'] };
  const yearProvider = { ...yearSource, year: 1927 };
  assert.equal(sameFilmWithDifferentYear(yearSource, yearProvider), true);
  for (const change of [{ director: 'Other Director' }, { cast: ['Brigitte Helm'] }, { title: 'Metropolis II' }])
    assert.equal(sameFilmWithDifferentYear(yearSource, { ...yearProvider, ...change }), false, 'Year exceptions require full-title and independent director/cast agreement'); checks += 9;
  {
    const url = 'https://www.critic.de/ov-movies-berlin/movie/a-film-123/';
    const criticHtml = `<div class="itemContainer"><h2><a href="${url}">A Film</a></h2><dl class="oneline">
      <dt class="hidden">Produktion:</dt><dd>USA 2026</dd><dt>D:</dt><dd>A Director</dd><dt>With:</dt><dd>Actor A,Actor B</dd></dl></div>
      <div class="itemContainer"><h2><a href="/ov-movies-berlin/movie/other-124/">Other Film</a></h2>
      <dl><dt>D:</dt><dd>Wrong Director</dd><dt>Produktion:</dt><dd>DE 1980</dd></dl></div>`;
    assert.deepEqual(parseSourceDetails(criticHtml, url), { director: 'A Director', cast: ['Actor A', 'Actor B'], country: 'USA', year: 2026 });
    assert.deepEqual(parseSourceDetails(criticHtml, url.replace('123', '999')), {}, 'Unrelated films cannot supply detail fields');
    const repeated = criticHtml + criticHtml;
    assert.deepEqual(parseSourceDetails(repeated, url), { director: 'A Director', cast: ['Actor A', 'Actor B'], country: 'USA', year: 2026 },
      'Identical credit blocks for the same source URL can appear once per language version');
    assert.deepEqual(parseSourceDetails(criticHtml + criticHtml.replace('A Director', 'Other Director'), url), {},
      'Contradictory credit blocks at one URL cannot supply a film identity'); checks += 2;
    const originalGet = axios.get; const requests: string[] = [];
    try {
      (axios as any).get = async (requested: string) => { requests.push(requested); return { data: criticHtml }; };
      const detailStore = new PipelineStore(':memory:');
      flag(detailStore, 'film-match', 'pending', 'Unresolved film', { observation: { data: { url } } });
      const deferred: any = { url: 'https://www.berlin.de/kino/_bin/filmdetail.php/1' };
      const missing: any = { url }; const secondLabel: any = { url };
      await fillSourceDetails([deferred, missing, secondLabel, { url: 'https://evil.example/movie/1/' }], detailStore, 1);
      assert.deepEqual(requests, [url], 'Spend the bounded lookup on an unresolved record; deduplicate its label variants');
      assert.equal(missing.director, 'A Director'); assert.equal(missing.year, 2026);
      assert.equal(secondLabel.director, 'A Director'); assert.equal(deferred.sourceDetails, undefined);
      assert.equal(missing.listingFields.director, null);
      detailStore.saveResource(`source-detail:${url}`, missing.sourceDetails, missing.sourceDetails.fetchedAt);
      await fillSourceDetails([missing], detailStore, 1);
      assert.equal(requests.length, 1, 'Valid parsed details are reused without refreshing their fetch time');
      assert.equal(missing.listingFields.director, null, 'Repeated detail fills retain original field provenance'); checks += 10;
      const genericUrl = 'https://www.critic.de/ov-movies-berlin/movie/festival-354819/';
      (axios as any).get = async () => ({ data: `<div class="itemContainer"><h2><a href="${genericUrl}">Festival</a></h2><p>Example Cinema 20:00</p></div>` });
      const empty: any = { url: genericUrl };
      await fillSourceDetails([empty], detailStore, 1);
      assert.equal(empty.sourceDetails.creditsChecked, true); assert.equal(empty.sourceDetails.failed, false);
      (axios as any).get = async () => ({ data: '<html><h1>Upstream unavailable</h1></html>' });
      const unsupported: any = { url: genericUrl };
      await fillSourceDetails([unsupported], detailStore, 1);
      assert.equal(unsupported.sourceDetails.creditsChecked, false); assert.equal(unsupported.sourceDetails.failed, true,
        'An HTTP 200 error or unsupported page cannot establish absent credits'); checks += 4;
      const withTimes = criticHtml.replace(/<\/dl>/g, '</dl><p>20:00</p>');
      (axios as any).get = async () => ({ data: withTimes + withTimes.replace('A Director', 'Conflicting Director') });
      const conflicting: any = { url };
      await fillSourceDetails([conflicting], new PipelineStore(':memory:'), 1);
      assert.equal(conflicting.sourceDetails.creditsChecked, false);
      assert.equal(conflicting.sourceDetails.failed, true, 'Contradictory repeated credits cannot be mistaken for confirmed absent credits'); checks += 2;
      const metadataStore = new PipelineStore(':memory:');
      const pending = observation('critic.de', 'listing', 'metadata-pending', { rawTitle: 'A Film', url }, NOW);
      metadataStore.observe(pending);
      metadataStore.saveEntity({ id: 'pending-film', kind: 'film', name: 'A Film', data: {} });
      metadataStore.saveLink(pending.subject, 'pending-film', linkEvidence(pending), 'provisional');
      flag(metadataStore, 'metadata-match', 'metadata:pending-film', 'Resolve metadata', { entityId: 'pending-film' });
      (axios as any).get = async () => ({ data: criticHtml });
      const refreshed = await refreshListingObservations(metadataStore, [pending], { network: true, now: NOW });
      assert.equal(refreshed[0].data.director, 'A Director', 'Entity-scoped metadata reviews must retrieve their source credits');
      assert.equal(refreshed[0].observedAt, NOW, 'A detail request must not renew source observation freshness');
      const retryUrl = 'https://www.berlin.de/kino/_bin/filmdetail.php/999999';
      const retried: string[] = [];
      (axios as any).get = async (requested: string) => { retried.push(requested);
        if (retried.length === 1) throw { response: { status: 307, headers: { location: 'https://untrusted.example/' } } };
        return { data: '<dl><dt>Regie:</dt><dd>A Director</dd></dl>' };
      };
      const retryRow: any = { url: retryUrl };
      await fillSourceDetails([retryRow], new PipelineStore(':memory:'), 1);
      assert.deepEqual(retried, [retryUrl, retryUrl], 'Transient responses retry only the original allowed URL, never an arbitrary redirect');
      assert.equal(retryRow.director, 'A Director'); checks += 4;
    } finally { axios.get = originalGet; }
  }
  const venueHtml = `<div class="article-attributes"><dl><dt>Adresse:</dt><dd><span class="street-address">Rosenthaler Str. 40-41</span>
    <span class="postal-code">10178</span><span class="locality">Berlin - Mitte</span></dd></dl></div>`;
  assert.deepEqual(parseVenueDetails(venueHtml), { address: 'Rosenthaler Str. 40-41, 10178 Berlin - Mitte', postalCode: '10178', explicitCity: 'Berlin' });
  assert.equal(parseVenueDetails('<footer>Rosenthaler Str. 40, 10178 Berlin</footer>'), null); checks += 2;

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-pipeline-'));
  const filename = path.join(directory, 'state.json');
  try {
    const first = new PipelineStore(filename); const second = new PipelineStore(filename);
    assert.ok(first.acquireLease('first')); assert.equal(second.acquireLease('second'), false);
    first.transaction(() => first.saveEntity({ id: 'film-1', name: 'Persisted', kind: 'film', data: {} }));
    assert.throws(() => first.transaction(() => { first.saveEntity({ id: 'film-2', name: 'Rollback', kind: 'film', data: {} }); throw new Error('rollback'); }));
    assert.equal(first.entity('film-2'), null); first.releaseLease('first'); assert.ok(second.acquireLease('second'));
    assert.equal(second.entity('film-1')!.name, 'Persisted'); second.releaseLease('second');
    assert.equal(fs.readdirSync(directory).some(name => name.endsWith('.tmp') || name.endsWith('.lock')), false);
    checks += 5;

    {
      const cleanup = new PipelineStore(':memory:'); cleanup.acquireLease('cleanup');
      for (const id of ['empty-orphan', 'active-empty', 'manual-empty']) cleanup.saveEntity({ id, kind: 'venue', name: id, data: { address: '', insideBerlin: false } });
      const source = observation('test', 'venue', 'active-empty', { name: 'active-empty' }, NOW); cleanup.observe(source);
      cleanup.saveLink(source.subject, 'active-empty', source.fingerprint, 'provisional');
      cleanup.addOverride({ subject: 'entity:manual-empty', action: 'patch', patch: { fields: { insideBerlin: false } },
        reason: 'Keep the administrator decision', actor: 'test', evidenceFingerprint: 'manual' });
      cleanup.saveResource('verified-location', { address: 'Confirmed address' }, NOW);
      const obsolete = flag(cleanup, 'venue-location', 'obsolete', 'Old review', {});
      const current = flag(cleanup, 'venue-location', source.subject, 'Current review', { observation: source });
      cleanup.beginReviewPass(); flag(cleanup, current.type, current.subject, current.title, current.details); cleanup.endReviewPass(NOW);
      const result = cleanup.cleanupSuperseded(NOW);
      assert.equal(result.archivedIssues, 1); assert.equal(result.archivedVenues, 1);
      assert.equal(cleanup.entity('empty-orphan'), null); assert.ok(cleanup.entity('active-empty')); assert.ok(cleanup.entity('manual-empty'));
      assert.equal(cleanup.issues().some(issue => issue.id === obsolete.id), false); assert.ok(cleanup.issues().some(issue => issue.id === current.id));
      assert.ok(cleanup.resource(result.archiveKey!)!.data.issues.some((issue: any) => issue.id === obsolete.id), 'Archived evidence remains recoverable');
      assert.equal(cleanup.resource('verified-location')!.data.address, 'Confirmed address'); assert.equal(cleanup.allOverrides().length, 1);
      assert.equal(cleanup.head(source.subject)!.id, source.id); checks += 11;
    }

    const store = new PipelineStore(':memory:');
    const initial = await execute(store, [batch('source-a')]);
    assert.equal(initial.total, 1); assert.equal(initial.movies[0].year, 2026);
    assert.equal(initial.movies[0].showings['2026-10-16']['20:00'][0].variants[0], 'OV');
    const firstId = initial.movies[0].id;
    const unchanged = await execute(store, [batch('source-a', [raw()], { observedAt: '2026-10-15T11:00:00Z' })]);
    assert.equal(unchanged.movies[0].id, firstId); checks += 4;

    const remakes = await execute(new PipelineStore(':memory:'), ['1980', '2026', null].map((year, index) => batch(String(index),
      [raw('Same Film', year, { showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: `${18 + index}:00` }] })])));
    assert.equal(remakes.total, 3, 'Undated listings cannot be guessed into a remake'); checks++;
    {
      const titleFallback = await execute(new PipelineStore(':memory:'), [batch('a', [raw('A Film', '2026', { url: 'https://source-a.test/film' })]),
        batch('b', [raw('A Film (OmU)', null, { director: null, cast: null, country: null, url: 'https://source-b.test/film' })])]);
      assert.equal(titleFallback.total, 1, 'A unique complete-title match across independent sources can consolidate an incomplete film listing');
      assert.equal(titleFallback.movies[0].sourceSubjects.length, 2); checks += 2;
      assert.equal(titleFallback.review.open, 0, 'A resolved unique-title group does not retain an unnecessary film-identity review'); checks++;
      assert.ok(titleFallback.movies[0].sourceAliases.find((alias: any) => alias.source === 'b').labels.includes('A Film (OmU)'),
        'Source-specific film names retain their source record and resolve to the consolidated movie'); checks++;
      const sameSource = await execute(new PipelineStore(':memory:'), [batch('a', [
        raw('A Film', null, { director: null, cast: null, url: 'https://source-a.test/one' }),
        raw('A Film', null, { director: null, cast: null, url: 'https://source-a.test/two' }),
      ])]);
      assert.equal(sameSource.total, 2, 'The title-only fallback requires independent sources'); checks++;
      const ambiguousSource = await execute(new PipelineStore(':memory:'), [batch('a', [
        raw('A Film', null, { director: null, cast: null, url: 'https://source-a.test/one' }),
        raw('A Film', null, { director: null, cast: null, url: 'https://source-a.test/two' }),
      ]), batch('b', [raw('A Film', null, { director: null, cast: null, url: 'https://source-b.test/one' })])]);
      assert.equal(ambiguousSource.total, 3, 'A source with two compatible records makes the title-only match ambiguous'); checks++;
      const ambiguousAliases = ambiguousSource.movies.flatMap((movie: any) => movie.sourceAliases.filter((alias: any) => alias.source === 'a')
        .map((alias: any) => ({ movieId: movie.id, url: alias.url })));
      assert.equal(new Set(ambiguousAliases.map((alias: any) => alias.movieId)).size, 2);
      assert.equal(new Set(ambiguousAliases.map((alias: any) => alias.url)).size, 2,
        'Same-name records from one source retain separate URL-to-identity mappings'); checks += 2;
      const conflictingDirectors = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Same Film', '2026')]),
        batch('b', [raw('Same Film', '2026', { director: 'Other Director' })])]);
      assert.equal(conflictingDirectors.total, 1, 'A complete title and shared viewing outweigh contradictory raw source directors'); checks++;
      const separateSchedules = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Same Film', '2026')]),
        batch('b', [raw('Same Film', '2026', { director: 'Other Director',
          showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: '22:00' }] })])]);
      assert.equal(separateSchedules.total, 2, 'Without shared screenings the contradictory director evidence still separates the films'); checks++;
      const qualifiers = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Vaiana', null, { director: null, cast: null })]),
        batch('b', [raw('Vaiana (Live Action)', null, { director: null, cast: null, originalTitle: 'Vaiana' })])]);
      assert.equal(qualifiers.total, 2, 'Distinguishing title qualifiers survive title matching'); checks++;
      const sequels = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Jailer', null, { director: null, cast: null })]),
        batch('b', [raw('Jailer 2', null, { director: null, cast: null, originalTitle: 'Jailer' })])]);
      assert.equal(sequels.total, 2, 'An alternate title cannot erase an explicit sequel number'); checks++;
      const genericProgramme = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Festival', null, { director: null, cast: null, url: 'https://source-a.test/festival',
        showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: '18:00', url: 'https://example.test/cinema/a' }] })]),
        batch('b', [raw('Festival', null, { director: null, cast: null, url: 'https://source-b.test/festival',
          showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: '21:00', url: 'https://example.test/cinema/b' }] })])]);
      assert.equal(genericProgramme.total, 2, 'An unresolved generic programme label cannot use the film title-only fallback'); checks++;
      const providerPeer = new PipelineStore(':memory:');
      providerPeer.saveResource('tmdb-detail:9001', { details: { id: 9001, title: 'A Film', original_title: 'A Film', release_date: '2026-01-01',
        production_countries: [{ iso_3166_1: 'DE', name: 'Germany' }] },
        credits: { crew: [{ job: 'Director', name: 'Director A' }], cast: [] } }, NOW);
      let redundantQueries = 0;
      const peerSource = batch('a', [raw('A Film', '2025', { director: null, cast: null, country: 'Spain', url: 'https://source-a.test/film' }),
        raw('A Film', '2026', { url: 'https://source-a.test/credited' })]);
      const incompleteSubject = adaptBatch(peerSource).find(item => item.kind === 'listing')!.subject;
      providerPeer.saveResource('public-identity:tmdb:9001', { id: identity('film', incompleteSubject) }, NOW);
      const withPeer = await execute(providerPeer, [peerSource,
        batch('b', [raw('A Film', '2026', { url: 'https://source-b.test/film' })])], {
        tmdb: { candidates: async () => { redundantQueries++; return []; },
          enrichSelected: async () => tmdbMovieData(providerPeer.resource('tmdb-detail:9001')!.data) },
      });
      assert.equal(redundantQueries, 0, 'A resolved source alias can use its corroborated peer metadata without searching the incomplete record again');
      assert.equal(withPeer.movies[0].identityStatus, 'verified'); assert.equal(withPeer.review.open, 0); checks += 3;
      assert.equal(withPeer.movies[0].sourceSubjects.length, 3, 'Previously corroborated source aliases count as one candidate film'); checks++;
      assert.equal(withPeer.movies[0].year, 2026); assert.equal(withPeer.movies[0].country, 'Germany',
        'An incomplete source alias must not override its resolved peer verified metadata');
      assert.equal(withPeer.movies[0].provenance.year.value, withPeer.movies[0].year); checks += 3;
      providerPeer.publish(withPeer, providerPeer.revision, NOW);
      const justAlias = await execute(providerPeer, [batch('a', [peerSource.movies[0]]), batch('b', [])]);
      assert.equal(justAlias.movies[0].id, withPeer.movies[0].id);
      assert.equal(justAlias.movies[0].identityStatus, 'verified'); assert.equal(justAlias.movies[0].year, 2026,
        'A previously resolved source alias retains the film identity and verified metadata after its corroborating listings withdraw'); checks += 3;
      const aliasObservation = providerPeer.head(incompleteSubject)!;
      providerPeer.addOverride({ subject: incompleteSubject, action: 'separate', targetId: withPeer.movies[0].id,
        evidenceFingerprint: linkEvidence(aliasObservation), actor: 'test', reason: 'Separate a saved movie alias' });
      const unmergedAlias = await execute(providerPeer, [peerSource, batch('b', [raw('A Film', '2026', { url: 'https://source-b.test/film' })])]);
      assert.equal(unmergedAlias.total, 2, 'A saved alias honors separation from the public movie ID as well as its internal representative');
      assert.equal(new Set(unmergedAlias.movies.map((movie: any) => movie.id)).size, 2, 'An unmerge restores distinct public identities'); checks += 2;
      const changedAlias = await execute(providerPeer, [batch('a', [{ ...peerSource.movies[0], director: 'Other Director' }])]);
      assert.equal(changedAlias.movies[0].identityStatus, 'source-only');
      assert.equal(changedAlias.movies[0].director, 'Other Director', 'Changed contradictory evidence invalidates the saved alias association'); checks += 2;
      const sourceOnlyAliases = new PipelineStore(':memory:');
      for (const [source, id, director, year] of [['a', 'alias-a', null, null], ['b', 'alias-b', 'Director A', '2026']] as const) {
        const rows = adaptBatch(batch(source, [raw('A Film', year, { director, cast: null, url: `https://${source}.test/film` })]));
        rows.forEach(row => sourceOnlyAliases.observe(row)); const listing = rows.find(row => row.kind === 'listing')!;
        sourceOnlyAliases.saveEntity({ id, name: 'A Film', kind: 'film', data: { director, year, titles: ['A Film'], sourceUrls: [listing.data.url] } });
        sourceOnlyAliases.saveLink(listing.subject, id, linkEvidence(listing), 'source-evidence');
      }
      const firstAliasPass = await execute(sourceOnlyAliases); sourceOnlyAliases.publish(firstAliasPass, sourceOnlyAliases.revision, NOW);
      const nextAliasPass = await execute(sourceOnlyAliases);
      assert.equal(nextAliasPass.movies[0].id, firstAliasPass.movies[0].id, 'Remembering a source alias retains a source-only public movie ID');
      assert.equal(nextAliasPass.movies[0].showings['2026-10-16']['20:00'][0].id, firstAliasPass.movies[0].showings['2026-10-16']['20:00'][0].id,
        'Source alias reuse must preserve the screening identity and its review corrections'); checks += 2;
      const noFilmSources = await execute(sourceOnlyAliases, [batch('a', []), batch('b', [])]);
      sourceOnlyAliases.publish(noFilmSources, sourceOnlyAliases.revision, NOW);
      const returningFilm = await execute(sourceOnlyAliases, [batch('a', [raw('A Film', null, { director: null, cast: null, url: 'https://a.test/film' })])]);
      assert.equal(returningFilm.movies[0].id, firstAliasPass.movies[0].id);
      assert.equal(returningFilm.movies[0].year, 2026); assert.equal(returningFilm.movies[0].provenance.year.source, 'b',
        'Returning aliases retain historical identity metadata with its actual source attribution'); checks += 3;
      const creditedAlias = new PipelineStore(':memory:');
      creditedAlias.saveResource('tmdb-detail:9002', { details: { id: 9002, title: 'City Lights', original_title: 'City Lights', release_date: '1931-01-01' },
        credits: { crew: [{ job: 'Director', name: 'Charlie Chaplin' }], cast: [{ name: 'Actor A' }, { name: 'Actor B' }] } }, NOW);
      const nicknameSource = batch('a', [raw('City Lights', '1931', { director: 'Charles Chaplin', cast: null, url: 'https://a.test/city-lights' })]);
      const actorSource = batch('b', [raw('City Lights', '1931', { director: null, cast: ['Actor A', 'Actor B'], url: 'https://b.test/city-lights' })]);
      const creditedFirst = await execute(creditedAlias, [nicknameSource, actorSource]); creditedAlias.publish(creditedFirst, creditedAlias.revision, NOW);
      const creditedNext = await execute(creditedAlias, [nicknameSource, batch('b', [])]);
      assert.equal(creditedNext.movies[0].identityStatus, 'verified');
      assert.equal(creditedNext.movies[0].director, 'Charlie Chaplin',
        'Reusing a known alias preserves the independent canonical credit profile and accepted metadata after source withdrawal'); checks += 2;
    }
    {
      const duplicates = new PipelineStore(':memory:');
      for (const [source, title] of [['a', 'A Film'], ['b', 'A Film (PLF 2D)']]) {
        const rows = adaptBatch(batch(source, [raw(title, null, { director: 'Director A', cast: ['Actor A', 'Actor B'] })]));
        rows.forEach(row => duplicates.observe(row));
        const listing = rows.find(row => row.kind === 'listing')!;
        duplicates.saveEntity({ id: `duplicate-${source}`, kind: 'film', name: 'A Film', data: { director: 'Director A', cast: ['Actor A', 'Actor B'],
          year: null, titles: ['A Film'], sourceUrls: [listing.data.url], nameSubject: listing.subject } });
        duplicates.saveLink(listing.subject, `duplicate-${source}`, linkEvidence(listing), 'source-evidence');
        duplicates.saveResource(`slug:duplicate-${source}`, { slug: `old-film-${source}` }, NOW);
      }
      duplicates.saveResource('tmdb-detail:9001', { details: { id: 9001, title: 'A Film', original_title: 'A Film', release_date: '2026-01-01' },
        credits: { crew: [{ job: 'Director', name: 'Director A' }], cast: [...Array.from({ length: 8 }, (_, index) => ({ name: `Other Actor ${index}` })), { name: 'Actor A' }, { name: 'Actor B' }] } }, NOW);
      const joined = await execute(duplicates);
      assert.equal(joined.total, 1, 'Established source links independently validated against one provider identity must publish as one film');
      assert.equal(joined.movies[0].sourceSubjects.length, 2);
      assert.deepEqual(joined.movies[0].showings['2026-10-16']['20:00'][0].variants, ['OV', 'PLF 2D'], 'Consolidating the film preserves presentation formats');
      assert.ok(joined.movies[0].slugAliases.includes('old-film-b'), 'The second existing movie URL must continue to work'); checks += 4;
      await execute(duplicates, ['a', 'b'].map(source => batch(source, [raw(source === 'a' ? 'A Film' : 'A Film (PLF 2D)', '2026', {
        director: 'Director A', cast: ['Actor A', 'Actor B'], url: `https://example.test/movie/${source === 'a' ? 'A Film' : 'A Film (PLF 2D)'}`,
      })], { observedAt: '2026-10-15T11:00:00Z' })));
      assert.equal(duplicates.issues().filter(issue => issue.type === 'film-match' && issue.status === 'open').length, 0,
        'Refreshing source credits must not create ambiguity between the existing record and its independently corroborated duplicate'); checks++;
      const listingB = duplicates.observations('b').find(item => item.kind === 'listing')!;
      const otherEntity = duplicates.link(duplicates.observations('a').find(item => item.kind === 'listing')!.subject)!.entityId;
      duplicates.addOverride({ subject: listingB.subject, action: 'separate', targetId: otherEntity, evidenceFingerprint: linkEvidence(listingB), actor: 'test', reason: 'Explicitly keep these records separate' });
      const separated = await execute(duplicates);
      assert.equal(separated.total, 2, 'An explicit manual separation overrides shared provider identity grouping');
      assert.ok(separated.movies.every((movie: any) => !movie.slugAliases.some((alias: string) => separated.movies.some((other: any) => other.slug === alias))),
        'A restored standalone record must reclaim its own URL without a stale merged alias taking precedence'); checks += 2;
    }
    {
      const creditedDuplicates = new PipelineStore(':memory:');
      for (const source of ['a', 'b']) {
        const rows = adaptBatch(batch(source, [raw('A Film', '2026')])); rows.forEach(row => creditedDuplicates.observe(row));
        const listing = rows.find(row => row.kind === 'listing')!;
        creditedDuplicates.saveEntity({ id: `credited-${source}`, kind: 'film', name: 'A Film',
          data: { director: 'Director A', year: 2026, titles: ['A Film'], sourceUrls: [listing.data.url], nameSubject: listing.subject } });
        creditedDuplicates.saveLink(listing.subject, `credited-${source}`, linkEvidence(listing), 'source-evidence');
      }
      assert.equal((await execute(creditedDuplicates)).total, 1,
        'Existing source records with the same complete title, director and production year do not require an API identity to consolidate'); checks++;
      const ambiguous = new PipelineStore(':memory:');
      const entries = [2000, 2001, 2002].map(year => {
        const entity = { id: `film-${year}`, kind: 'film' as const, name: 'Same Film', data: { year, director: 'Same Director', titles: ['Same Film'] } };
        ambiguous.saveEntity(entity);
        const listing = observation(String(year), 'listing', 'same', { title: 'Same Film', year, director: 'Same Director' }, NOW);
        ambiguous.observe(listing); ambiguous.saveLink(listing.subject, entity.id, linkEvidence(listing), 'source-evidence');
        return entity;
      });
      assert.equal(filmDisplayGroups(ambiguous, entries).size, 3, 'Pairwise corroboration cannot bridge contradictory production years');
      const otherTitle = { ...entries[1], id: 'other-title', name: 'Same Film Returns', data: { ...entries[1].data, titles: ['Same Film Returns'] } };
      assert.equal(filmDisplayGroups(ambiguous, [entries[0], otherTitle]).size, 2, 'Shared title fragments cannot establish a publication group'); checks += 2;
      const providerConflicts = new PipelineStore(':memory:');
      const separateIds = [1, 2].map(id => {
        const entity = { id: `provider-${id}`, kind: 'film' as const, name: 'Same Film', data: { tmdbId: id, verifiedImdbId: `tt${id}`, titles: ['Same Film'] } };
        providerConflicts.saveEntity(entity);
        const listing = observation(String(id), 'listing', 'same', { rawTitle: 'Same Film', title: 'Same Film' }, NOW);
        providerConflicts.observe(listing); providerConflicts.saveLink(listing.subject, entity.id, linkEvidence(listing), 'source-evidence'); return entity;
      });
      assert.equal(filmDisplayGroups(providerConflicts, separateIds).size, 2, 'Matching full titles cannot override distinct accepted provider IDs'); checks++;
    }
    {
      let queries: string[] = [];
      const originalTitleStore = new PipelineStore(':memory:');
      await execute(originalTitleStore, [batch('a', [raw('Translated Listing', '2026', { originalTitle: 'Actual Original Title', altTitle: 'Other Display Title' })])], {
        tmdb: { candidates: async (titles: string[]) => { queries = titles; return []; } },
      });
      assert.equal(queries[0], 'Actual Original Title', 'An explicit original title must be the first API query');
      assert.ok(queries.includes('Translated Listing')); assert.equal(queries.length, new Set(queries).size);
      assert.deepEqual(parseSourceDetails('<dl><dt>Originaltitel:</dt><dd>Actual Original Title</dd></dl>'),
        { originalTitle: 'Actual Original Title', altTitle: 'Actual Original Title' }); checks += 4;
      originalTitleStore.addOverride({ subject: `entity:${originalTitleStore.entities('film')[0].id}`, action: 'patch',
        patch: { fields: { originalTitle: 'Corrected Original Title' } }, actor: 'test', reason: 'Explicit original-title correction', evidenceFingerprint: 'manual' });
      await execute(originalTitleStore, undefined, { tmdb: { candidates: async (titles: string[]) => { queries = titles; return []; } } });
      assert.equal(queries[0], 'Corrected Original Title', 'A corrected original title also takes priority and invalidates the old search cache'); checks++;
    }
    {
      const queenStore = new PipelineStore(':memory:');
      const queenUrl = 'https://www.berlin.de/kino/_bin/filmdetail.php/316304';
      queenStore.saveResource(`source-detail:${queenUrl}`, { url: queenUrl, fetchedAt: NOW, parserVersion: 2,
        fields: { director: 'János Zsombolyai', cast: ['Freddie Mercury', 'Brian May'], year: 1987 } }, NOW);
      queenStore.saveEntity({ id: 'jim-queen', kind: 'film', name: 'Jim Queen', data: {
        director: 'Nicolas Athane, Marco Nguyen', year: 2026, cast: ['François Sagat', 'Jérémy Gillet'], titles: ['Jim Queen'] } });
      await execute(queenStore, [batch('berlin.de', [raw('Queen Budapest', null, { director: null, cast: null, url: queenUrl })])]);
      const queenReview = queenStore.issues().find(issue => issue.type === 'film-match');
      assert.ok(!queenReview?.details.candidates.some((candidate: any) => candidate.name === 'Jim Queen'),
        'Queen Budapest must use available detail credits before considering the unrelated Jim Queen');
      const queenHead = queenStore.observations('berlin.de', true).find(item => item.kind === 'listing')!;
      assert.equal(queenHead.observedAt, NOW, 'Retrieving identity details must not renew listing/screening freshness');
      assert.equal(queenHead.data.director, 'János Zsombolyai');
      checks++;
    }
    {
      const nameOnly = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Queen Budapest', null, { director: null, cast: null })]),
        batch('b', [raw('Jim Queen', null, { director: null, cast: null })])], { model: model(request => Object.keys(request.questions.identity.choices)[0]) });
      assert.equal(nameOnly.total, 2, 'Even a confident model cannot merge films using only an overlapping title word'); checks++;
      const nameOnlyVenues = new PipelineStore(':memory:'); nameOnlyVenues.acquireLease('name-only-venues');
      nameOnlyVenues.saveEntity({ id: 'cubix', kind: 'venue', name: 'CineStar CUBIX', data: { address: 'Alexanderplatz 1, 10178 Berlin', insideBerlin: true } });
      const resolver = new IdentityResolver(nameOnlyVenues, new DecisionEngine(nameOnlyVenues, model(() => 'cubix')));
      for (const name of ['CineStar', 'CineStar CUBIX']) {
        const venue = await resolver.venue(observation('a', 'venue', name, { name, address: '' }, NOW));
        assert.notEqual(venue.id, 'cubix', 'A cinema name or brand alone cannot establish the same physical venue'); checks++;
      }
      const providerStore = new PipelineStore(':memory:');
      for (const [id, title, year, director, cast] of [
        [142773, 'Queen: Live in Budapest', '1986', 'János Zsombolyai', ['Freddie Mercury', 'Brian May']],
        [1061798, 'Jim Queen', '2026', 'Nicolas Athané', ['François Sagat', 'Jérémy Gillet']],
      ] as const) providerStore.saveResource(`tmdb-detail:${id}`, { details: { id, title, original_title: title, release_date: `${year}-01-01` },
        credits: { crew: [{ job: 'Director', name: director }], cast: cast.map(name => ({ name })) } }, NOW);
      const providerEvidence = new CachedFilmEvidence(providerStore, NOW);
      assert.equal(providerEvidence.match({ title: 'Queen Budapest', director: 'János Zsombolyai', year: 1987 })?.id, 142773);
      assert.equal(providerEvidence.match({ title: 'Jim Queen', director: 'Nicolas Athane', year: 2026 })?.id, 1061798);
      assert.equal(providerEvidence.match({ title: 'Queen Budapest' }), null, 'Search/name overlap does not verify a provider identity');
      assert.equal(providerEvidence.match({ title: 'Queen Budapest', director: 'Nicolas Athane', year: 2026 }), null, 'A title hit cannot override incompatible director/year evidence');
      assert.equal(providerEvidence.match({ title: 'Queen Budapest', director: 'János Zsombolyai', year: 2026 }), null, 'A re-release year is not silently treated as an original production year'); checks += 5;
      const continuingQueen = new PipelineStore(':memory:');
      continuingQueen.saveResource('tmdb-detail:142773', providerStore.resource('tmdb-detail:142773')!.data, NOW);
      const queenListing = (year: string) => batch('queen-source', [raw('Queen Budapest', year, { director: 'János Zsombolyai', cast: ['Freddie Mercury', 'Brian May'] })]);
      await execute(continuingQueen, [queenListing('1987')]);
      const changedYear = await execute(continuingQueen, [queenListing('2026')]);
      assert.equal(changedYear.total, 1);
      assert.equal(changedYear.movies[0].identityStatus, 'verified');
      assert.equal(continuingQueen.issues().filter(issue => issue.status === 'open').length, 0,
        'A year-only change at an established source record retains identity when director and cast independently revalidate the same provider ID');
      assert.equal(continuingQueen.observations('queen-source').find(o => o.kind === 'listing')!.data.year, '2026',
        'The conflicting source year remains explicit evidence rather than being rewritten'); checks += 4;
      await execute(continuingQueen, [batch('queen-source', [raw('Queen Budapest', '2026', { director: 'János Zsombolyai', cast: null })])]);
      assert.ok(continuingQueen.issues().some(issue => issue.type === 'source-identity-changed' && issue.status === 'open'),
        'A year contradiction without independently corroborating cast cannot use the continuity exception'); checks++;
      providerStore.saveResource('tmdb-search:localized', [{ id: 142773, title: 'Konzertfilm', original_title: 'Magic – Queen in Budapest' }], NOW);
      assert.equal(new CachedFilmEvidence(providerStore, NOW).match({ title: 'Konzertfilm', director: 'János Zsombolyai', year: 1987 })?.id, 142773,
        'A localized provider search label can retrieve the corresponding complete credit evidence');
      assert.equal(new CachedFilmEvidence(providerStore, NOW).match({ title: 'Konzertfilm' }), null, 'A localized search label still cannot establish identity alone'); checks += 2;
      const unsupportedMetadataStore = new PipelineStore(':memory:');
      const unsupported = await execute(unsupportedMetadataStore, [batch('a', [raw('A Film', null, { director: null, cast: null })])], {
        model: model(() => '123'), tmdb: { candidates: async () => [{ id: 123, title: 'A Film', release_date: '2026-01-01' }],
          getMovieDetails: async () => ({ details: { id: 123, title: 'A Film', release_date: '2026-01-01' }, credits: { crew: [{ job: 'Director', name: 'Unknown Director' }], cast: [] } }),
          enrichSelected: async () => { throw new Error('Name-only metadata acceptance must be blocked'); } },
      });
      assert.equal(unsupported.movies[0].identityStatus, 'source-only');
      assert.ok(unsupportedMetadataStore.issues().some(issue => issue.type === 'metadata-match' && issue.status === 'open')); checks += 2;
    }
    {
      const programmeStore = new PipelineStore(':memory:'); let calls = 0;
      const noDecisions = model(() => { calls++; return 'insufficient'; });
      const labels = ['Met im Kino: Macbeth', 'Met Opera 2026/27: Giuseppe Verdi MACBETH', 'Pornfilmfestival Berlin 2026',
        '10. Obscura Filmfestival Berlin 2026', 'NewGen Film Festival 2026', 'Ukrainisches Film Festival',
        'Ukrainian Film Festival Berlin 2026', 'Sneak Preview', 'Sneak Preview ab 18', 'CineSneak', 'Kurzfilm(e)', 'Filmreihe(n)', 'Shorts Attack - Kurzfilm(e)',
        'Shorts Attack! - The Kids are alright', 'Überraschungsfilm', 'Schwule Filmtage'];
      const result = await execute(programmeStore, [batch('a', labels.map(title => raw(title, null, { director: null }))),
        batch('b', [raw('Sneak Preview', null, { director: null, url: 'https://other.test/sneak' })])], { model: noDecisions });
      assert.equal(calls, 0, 'Explicit programmes require neither classification nor speculative film matching');
      assert.ok(result.movies.every((movie: any) => movie.kind === 'programme'));
      assert.equal(result.movies.filter((movie: any) => movie.title === 'Sneak Preview').length, 2, 'Unidentified sneaks stay scoped to their own source records');
      assert.equal(result.review.open, 0);
      const sneakSlot = { cinema: 'Example Cinema', date: '2026-10-21', time: '20:30', url: 'https://example.test/cinema/1' };
      const sharedSchedule = await execute(new PipelineStore(':memory:'), [
        batch('critic.de', [raw('Sneak Preview', null, { director: null, url: 'https://critic.test/sneak',
          showings: [{ ...sneakSlot, url: 'https://critic.test/cinema' }] })]),
        batch('berlin.de', [
          raw('Sneak Preview (OmU)', null, { director: null, url: 'https://berlin.test/filmdetail/1',
            showings: [{ ...sneakSlot, url: 'https://berlin.test/cinema' }] }),
          raw('Sneak Preview  (OmU)', null, { director: null, url: 'https://berlin.test/filmdetail/2',
            showings: [{ ...sneakSlot, url: 'https://berlin.test/cinema' }] }),
        ]),
      ], { model: noDecisions });
      assert.equal(sharedSchedule.movies.filter((movie: any) => movie.title === 'Sneak Preview').length, 1,
        'Same-title sneak programmes that share a cinema/date/time publish as one listing');
      assert.equal(sharedSchedule.total, 1); checks += 2;
      const festival = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Festival', null, { director: null, cast: null })])]);
      assert.equal(festival.review.open, 1, 'A bare Festival label still requires classification evidence');
      const festivalUrl = 'https://www.critic.de/ov-movies-berlin/movie/festival-354819/';
      const genericStore = new PipelineStore(':memory:');
      genericStore.saveResource(`source-detail:${festivalUrl}`, { url: festivalUrl, fields: {}, fetchedAt: NOW, parserVersion: 3, creditsChecked: true }, NOW);
      const genericRaw = raw('Festival', null, { director: null, cast: null, isSpecial: true, url: festivalUrl });
      const special = await execute(genericStore, [batch('critic.de', [genericRaw])]);
      assert.equal(special.review.open, 0); assert.equal(special.movies[0].isSpecial, true);
      assert.equal(genericStore.entity(special.movies[0].id)!.data.programmeFallback, true);
      const repaired = await execute(genericStore, [batch('critic.de', [{ ...genericRaw, director: 'A Director', cast: ['An Actor'] }])]);
      assert.equal(repaired.movies[0].isSpecial, false, 'New credits replace the provisional generic-programme fallback');
      assert.equal(repaired.movies[0].id, special.movies[0].id, 'Reclassification retains the source identity and public URL');
      for (const details of [undefined, { url: festivalUrl, fields: {}, fetchedAt: NOW, failed: true, creditsChecked: false },
        { url: festivalUrl, fields: {}, fetchedAt: NOW, creditsChecked: false }]) {
        const unknown = await execute(new PipelineStore(':memory:'), [batch('critic.de', [{ ...genericRaw, sourceDetails: details }])]);
        assert.equal(unknown.review.open, 1, 'Missing, failed or unsupported detail checks cannot establish absent credits');
      }
      const conflictingSource = await execute(new PipelineStore(':memory:'), [batch('critic.de', [{ ...genericRaw,
        sourceDetails: { url: festivalUrl, fields: {}, fetchedAt: NOW, parserVersion: 3, creditsChecked: true } }]),
      batch('berlin.de', [raw('Festival', '2005', { director: 'Another Director', cast: null })])]);
      assert.ok(conflictingSource.movies.every((movie: any) => movie.isSpecial === false), 'Credits on another available source prevent the special-programme fallback'); checks += 9;
      const configuration = await execute(new PipelineStore(':memory:'), [batch('a')]);
      assert.equal(configuration.review.open, 0, 'Missing model configuration is operational status, not a film review'); checks += 6;
      const reclassifiedStore = new PipelineStore(':memory:');
      const reclassifiedBatch = batch('a', [raw('Shorts Attack! - The Kids are alright', '2026', { director: 'diverse' })]);
      const reclassifiedListing = adaptBatch(reclassifiedBatch).find(item => item.kind === 'listing')!;
      reclassifiedStore.saveEntity({ id: 'obsolete-film', kind: 'film', name: reclassifiedBatch.movies[0].rawTitle, data: {} });
      reclassifiedStore.saveResource(`source-alias:film:${reclassifiedListing.subject}`, {
        source: 'a', subject: reclassifiedListing.subject, entityId: 'obsolete-film', evidenceFingerprint: linkEvidence(reclassifiedListing),
      }, NOW);
      reclassifiedStore.saveResource('published-identity:film:obsolete-film', { publicId: 'old-public-anchor' }, NOW);
      reclassifiedStore.saveResource('slug:old-public-anchor', { slug: 'old-programme-url' }, NOW);
      const reclassified = await execute(reclassifiedStore, [reclassifiedBatch]);
      assert.equal(reclassified.movies[0].kind, 'programme');
      assert.ok(reclassified.movies[0].slugAliases.includes('old-programme-url'), 'Reclassifying the same unchanged source record preserves its old public URL without retaining an incorrect film identity'); checks += 2;
    }
    {
      const qualifierStore = new PipelineStore(':memory:');
      const qualifier = observation('critic.de', 'listing', 'qualifier', { rawTitle: 'Lalka (The Doll) (OmU)',
        displayTitle: 'Lalka (OV w/ sub)', altTitle: 'Lalka' }, NOW);
      const label = await interpret(qualifierStore, new DecisionEngine(qualifierStore, null), qualifier);
      assert.equal(label.title, 'Lalka (The Doll)'); assert.deepEqual(label.ambiguous, []);
      assert.deepEqual(modalityTags(label.modality), ['OmU']); assert.equal(qualifierStore.issues().length, 0);
      const unknown = { ...qualifier, data: { ...qualifier.data, rawTitle: 'Lalka (Unknown cut) (OmU)' } };
      await interpret(qualifierStore, new DecisionEngine(qualifierStore, null), unknown);
      assert.ok(qualifierStore.issues().some(issue => issue.type === 'label-interpretation' && issue.status === 'open')); checks += 5;
    }
    {
      for (const [previous, current] of [['Vaiana', 'Vaiana (Live Action)'], ['Kurzfilm', 'Kurzfilm(e)'],
        ['Filmreihe', 'Filmreihe(n)'], ['Shorts Attack - Kurzfilm', 'Shorts Attack - Kurzfilm(e)'],
        ['Street Fighter', 'Street Fighter (PLF 2D)'], ['Verity', 'Verity (PLF 2D)'], ['Lalka', 'Lalka (The Doll)']]) {
        const continuityStore = new PipelineStore(':memory:');
        const original = await execute(continuityStore, [batch('a', [raw(previous, null, { director: null, url: 'https://source.test/record/1' })])]);
        const updated = await execute(continuityStore, [batch('a', [raw(current, null, { director: null, url: 'https://source.test/record/1',
          ...(current.startsWith('Lalka') ? { altTitle: 'Lalka', displayTitle: 'Lalka (OV w/ sub)' } : {}) })])]);
        assert.equal(updated.movies[0].id, original.movies[0].id, 'A bounded same-source label change must preserve public identity');
        assert.equal(updated.movies[0].slug, original.movies[0].slug);
        assert.equal(updated.movies[0].title, parseLabel(current).title, 'Retain the latest full title qualifier');
        assert.equal(updated.review.open, 0); checks += 4;
      }
      const changedSource = new PipelineStore(':memory:');
      const original = await execute(changedSource, [batch('a', [raw('Vaiana', '2016', { url: 'https://source.test/record/1' })])]);
      const remake = await execute(changedSource, [batch('a', [raw('Vaiana (Live Action)', '2026', { url: 'https://source.test/record/1' })])]);
      assert.notEqual(remake.movies[0].id, original.movies[0].id, 'Source URL continuity must not override contradictory identity evidence');
      const unrelated = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Vaiana', null, { director: null })]),
        batch('b', [raw('Vaiana (Live Action)', null, { director: null })])]);
      assert.equal(unrelated.total, 2, 'Title qualifier handling never establishes identity across different source URLs'); checks += 2;
      const separatedStore = new PipelineStore(':memory:'); separatedStore.acquireLease('separation-test');
      const previous = observation('a', 'listing', 'before', { rawTitle: 'Vaiana', url: 'https://source.test/1' }, NOW);
      const current = observation('a', 'listing', 'after', { rawTitle: 'Vaiana (Live Action)', url: 'https://source.test/1' }, NOW);
      separatedStore.observe(previous); separatedStore.observe(current);
      separatedStore.saveEntity({ id: 'excluded', name: 'Vaiana', kind: 'film', data: { sourceUrls: [previous.data.url] } });
      separatedStore.saveLink(previous.subject, 'excluded', linkEvidence(previous), 'source-evidence');
      separatedStore.addOverride({ subject: current.subject, action: 'separate', targetId: 'excluded', evidenceFingerprint: linkEvidence(current), actor: 'test', reason: 'Keep distinct' });
      const kept = await new IdentityResolver(separatedStore, new DecisionEngine(separatedStore, null)).film(current, parseLabel(current.data.rawTitle));
      assert.notEqual(kept.id, 'excluded', 'Source continuity must respect explicit manual separation'); checks++;
      const correctedKindStore = new PipelineStore(':memory:');
      const bernd = await execute(correctedKindStore, [batch('a', [raw('Bernd - Operation Germanenkind', null, { director: null })])]);
      const entity = correctedKindStore.entity(bernd.movies[0].id)!;
      correctedKindStore.saveEntity({ ...entity, kind: 'programme' });
      const correctedKind = await execute(correctedKindStore);
      assert.equal(correctedKind.movies[0].id, bernd.movies[0].id, 'Repairing the obsolete opera substring hint retains the public identity');
      assert.equal(correctedKind.movies[0].kind, 'film'); assert.equal(correctedKind.review.open, 0); checks += 3;
    }
    const conflict = await execute(new PipelineStore(':memory:'), [batch('a', [raw('A Film', '2026')]), batch('b', [raw('A Film', '2026', { director: 'Other Director' })])]);
    assert.equal(conflict.total, 1, 'A shared viewing and complete title outweigh conflicting source directors'); checks++;

    const freshness = new PipelineStore(':memory:');
    await execute(freshness, [batch('a')]);
    const failed = await execute(freshness, [batch('a', [], { status: 'failed', complete: false })]);
    assert.equal(failed.total, 1); assert.equal(failed.movies[0].showings['2026-10-16']['20:00'][0].stale, true);
    assert.equal((await execute(freshness, undefined, { now: '2026-10-16T10:01:00Z' })).total, 0, 'Expire unsupported screening evidence after 24 hours');
    assert.equal((await execute(freshness, [batch('a', [], { complete: true })])).total, 0, 'Complete refresh retires absent source support'); checks += 4;
    const partial = new PipelineStore(':memory:'); await execute(partial, [batch('a')]);
    assert.equal((await execute(partial, [batch('a', [], { complete: false })])).total, 1, 'Partial pagination cannot retire screenings'); checks++;

    const outside = await execute(new PipelineStore(':memory:'), [batch('a', [raw('Outside', '2026', {
      cinemas: [{ name: 'Other Cinema', address: 'Example Straße 2, 14467 Potsdam' }], showings: [{ cinema: 'Other Cinema', date: '2026-10-16', time: '20:00' }],
    })])]);
    assert.equal(outside.total, 0, 'Scraper default city=Berlin must not establish geographic inclusion'); checks++;

    const venueStore = new PipelineStore(':memory:');
    const venueSource = observation('berlin.de', 'venue', 'cinema-1', { name: 'Source cinema name', address: 'Rosenthaler Str. 40-41' }, NOW);
    const addressEvidence = [{ id: 'way/building', address: 'Rosenthaler Straße 40/41, 10178 Berlin', insideBerlin: true, latitude: 52.52, longitude: 13.4 }];
    const venueResolver = new IdentityResolver(venueStore, new DecisionEngine(venueStore, null), [], addressEvidence);
    const verifiedVenue = await venueResolver.venue(venueSource);
    assert.equal(verifiedVenue.data.insideBerlin, true, 'An OSM building address establishes location without a cinema name match');
    assert.equal(verifiedVenue.data.latitude, 52.52);
    assert.equal(verifiedVenue.data.locationEvidence.method, 'exact-source-address');
    assert.equal(venueStore.issues().some(i => i.type === 'venue-location'), false);
    const otherAtAddress = await venueResolver.venue(observation('critic.de', 'venue', 'cinema-2', { name: 'Distinct cinema', address: 'Rosenthaler Straße 40/41' }, NOW));
    assert.equal(otherAtAddress.data.insideBerlin, true);
    assert.notEqual(otherAtAddress.id, verifiedVenue.id, 'An address alone cannot merge distinct cinemas at the same site');
    const wrongHouse = await venueResolver.venue(observation('berlin.de', 'venue', 'cinema-3', { name: 'Different place', address: 'Rosenthaler Str. 40' }, NOW));
    assert.equal(wrongHouse.data.insideBerlin, false, 'A partial house-number range is not exact address evidence');
    const outsideCity = await venueResolver.venue(observation('berlin.de', 'venue', 'cinema-4', { name: 'Other city', address: 'Rosenthaler Str. 40-41, 14467 Potsdam' }, NOW));
    assert.equal(outsideCity.data.insideBerlin, false); checks += 8;

    const duplicateStore = new PipelineStore(':memory:');
    duplicateStore.saveEntity({ id: 'known-venue', kind: 'venue', name: 'Hackesche Höfe Kino', data: { address: 'Rosenthaler Straße 40/41, 10178 Berlin', insideBerlin: true } });
    duplicateStore.saveEntity({ id: 'unresolved-duplicate', kind: 'venue', name: 'Hackesche Höfe Kino', data: { address: '', insideBerlin: false } });
    const sameVenue = await new IdentityResolver(duplicateStore, new DecisionEngine(duplicateStore, null)).venue(
      observation('berlin.de', 'venue', 'hackesche', { name: 'Hackesche Höfe Kino', address: 'Rosenthaler Str. 40/41, 10178 Berlin' }, NOW));
    assert.equal(sameVenue.id, 'known-venue', 'An unverified duplicate must not block a unique verified venue match'); checks++;
    const reviewedVenue = observation('berlin.de', 'venue', 'manual-location', { name: 'Outside venue', address: '' }, NOW);
    duplicateStore.observe(reviewedVenue);
    duplicateStore.saveEntity({ id: 'outside-venue', kind: 'venue', name: 'Outside venue', data: { insideBerlin: false } });
    const locationIssue = flag(duplicateStore, 'venue-location', reviewedVenue.subject, 'Confirm location', { observation: reviewedVenue, entityId: 'outside-venue' });
    const locationResult = applyReview(duplicateStore, { issueId: locationIssue.id, action: 'fields', revision: duplicateStore.revision,
      evidenceFingerprint: locationIssue.fingerprint, reason: 'Confirmed outside city', values: { insideBerlin: false } });
    assert.equal(locationResult.overrideIds.length, 2, 'A location decision saves its field correction and pins the source venue together');
    assert.equal((await new IdentityResolver(duplicateStore, new DecisionEngine(duplicateStore, model(() => 'known-venue'))).venue(reviewedVenue)).id, 'outside-venue'); checks += 2;

    const detailStore = new PipelineStore(':memory:'); const originalGet = axios.get; let detailRequests = 0;
    try {
      (axios as any).get = async () => { detailRequests++; return { data: venueHtml }; };
      const venueMovie = () => ({ cinemas: [{ name: 'Hackesche', address: '', url: 'https://www.berlin.de/kino/_bin/kinodetail.php/30203' }], showings: [{ cinema: 'Hackesche', address: '' }] });
      const rows = [venueMovie(), venueMovie()];
      await fillVenueDetails(rows, detailStore);
      assert.equal(detailRequests, 1, 'Fetch each venue once across film listings');
      assert.equal(rows[0].cinemas[0].address, 'Rosenthaler Str. 40-41, 10178 Berlin - Mitte');
      assert.equal(rows[1].showings[0].address, rows[0].cinemas[0].address);
      await fillVenueDetails([venueMovie()], detailStore);
      assert.equal(detailRequests, 1, 'Reuse the persisted venue-detail cache across refreshes'); checks += 4;
      const redirectedStore = new PipelineStore(':memory:'); let redirectedCalls = 0;
      const redirectedUrl = venueMovie().cinemas[0].url;
      redirectedStore.saveResource(`source-venue:${redirectedUrl}`, { failed: true, reason: 'Venue detail request returned HTTP 307.' }, NOW);
      (axios as any).get = async () => ++redirectedCalls === 1
        ? { status: 307, headers: { location: `${redirectedUrl}?view=details` } } : { status: 200, data: venueHtml };
      const redirectedMovie = venueMovie();
      await fillVenueDetails([redirectedMovie], redirectedStore, 1, { now: NOW });
      assert.equal(redirectedCalls, 2, 'Follow a bounded redirect for the same first-party venue and retry cached redirect failures');
      assert.equal(redirectedMovie.cinemas[0].address, rows[0].cinemas[0].address);
      redirectedCalls = 0;
      (axios as any).get = async () => { redirectedCalls++; return { status: 307, headers: { location: 'https://example.test/other-venue' } }; };
      const rejectedMovie = venueMovie(); await fillVenueDetails([rejectedMovie], new PipelineStore(':memory:'));
      assert.equal(rejectedMovie.cinemas[0].address, ''); assert.equal(redirectedCalls, 1, 'Do not follow a redirect to an unrelated source'); checks += 4;
      const transientStore = new PipelineStore(':memory:'); let retryCalls = 0;
      transientStore.saveResource(`source-venue:${redirectedUrl}`, { failed: true, status: 'request-failed', fields: {}, reason: 'Venue detail request failed or timed out.' }, NOW);
      (axios as any).get = async () => { retryCalls++; return { status: 200, data: venueHtml }; };
      await fillVenueDetails([venueMovie()], transientStore, 1, { now: '2026-10-15T10:01:00Z' });
      assert.equal(retryCalls, 0, 'Briefly cache failures to avoid hammering a failing source');
      const recoveredMovie = venueMovie(); await fillVenueDetails([recoveredMovie], transientStore, 1, { now: '2026-10-15T10:06:00Z' });
      assert.equal(retryCalls, 1, 'A transient failure must be retried after five minutes, not block the next scheduled scrape');
      assert.equal(recoveredMovie.cinemas[0].address, rows[0].cinemas[0].address); checks += 3;
    } finally { axios.get = originalGet; }

    const tegelStore = new PipelineStore(':memory:');
    const tegelUrl = 'https://www.berlin.de/kino/_bin/kinodetail.php/30181';
    const tegelRaw = raw('A Film', '2026', { cinemas: [{ name: 'CineStar Tegel', address: '', url: tegelUrl }],
      showings: [{ cinema: 'CineStar Tegel', date: '2026-10-16', time: '20:00', url: tegelUrl }] });
    assert.equal((await execute(tegelStore, [batch('berlin.de', [tegelRaw])], { osm: [] })).total, 0);
    const originalVenue = tegelStore.observations().find(o => o.kind === 'venue')!;
    tegelStore.saveResource(`source-venue:${tegelUrl}`, { url: tegelUrl, fetchedAt: '2026-10-15T11:00:00Z',
      fields: { address: 'Am Borsigturm 2, 13507 Berlin - Reinickendorf', postalCode: '13507', explicitCity: 'Berlin' } }, '2026-10-15T11:00:00Z');
    const repairedTegel = await execute(tegelStore, undefined, { osm: [] });
    assert.equal(repairedTegel.total, 1, 'Admin replay must extract cached detail-page addresses from older blank source records');
    assert.equal(repairedTegel.movies[0].cinemas[0].address, 'Am Borsigturm 2, 13507 Berlin - Reinickendorf');
    assert.equal(tegelStore.head(originalVenue.subject)!.observedAt, NOW, 'A venue address lookup must not renew screening/source freshness');
    assert.equal(originalVenue.data.address, '', 'Original blank-address evidence remains immutable'); checks += 5;
    assert.equal((await execute(tegelStore, [batch('berlin.de', [tegelRaw])], { osm: [] })).movies[0].cinemas[0].address,
      'Am Borsigturm 2, 13507 Berlin - Reinickendorf', 'Cached raw input must not undo the detail repair on the next merge'); checks++;

    const compatibleStore = new PipelineStore(':memory:');
    compatibleStore.saveEntity({ id: 'confirmed-cinema', kind: 'venue', name: 'Hackesche Höfe Kino', data: { address: 'Rosenthaler Straße 40/41, 10178 Berlin', insideBerlin: true } });
    const blankConfirmed = observation('berlin.de', 'venue', 'confirmed-source', { name: 'Hackesche Höfe Kino', address: '' }, NOW);
    compatibleStore.observe(blankConfirmed);
    const confirmedIssue = flag(compatibleStore, 'venue-match', blankConfirmed.subject, 'Confirm cinema', { observation: blankConfirmed });
    applyReview(compatibleStore, { issueId: confirmedIssue.id, action: 'link', targetId: 'confirmed-cinema', revision: compatibleStore.revision,
      evidenceFingerprint: confirmedIssue.fingerprint, reason: 'User checked the cinema address' });
    const confirmingAddress = observation('berlin.de', 'venue', 'confirmed-source', { name: 'Hackesche Höfe Kino', address: 'Rosenthaler Str. 40-41, 10178 Berlin - Mitte' }, NOW);
    const confirmationResolver = new IdentityResolver(compatibleStore, new DecisionEngine(compatibleStore, null));
    assert.equal((await confirmationResolver.venue(confirmingAddress)).id, 'confirmed-cinema', 'New address evidence that confirms a manual decision must not invalidate it');
    assert.equal(compatibleStore.issues().some(issue => issue.type === 'correction-conflict'), false);
    const conflictingAddress = observation('berlin.de', 'venue', 'confirmed-source', { name: 'Hackesche Höfe Kino', address: 'Rosenthaler Straße 42, 10178 Berlin' }, NOW);
    assert.notEqual((await confirmationResolver.venue(conflictingAddress)).id, 'confirmed-cinema', 'A genuinely different address still reopens manual identity review'); checks += 3;

    const geoStore = new PipelineStore(':memory:'); let geoRequests: any[] = []; const beforeGeoGet = axios.get;
    let geoMode = 'berlin';
    const geoPlace = (name: string, extra: any = {}) => ({ place_id: `place-${name}`, name, street: 'Am Borsigturm', housenumber: '2', postcode: '13507', city: 'Berlin',
      lat: 52.5845, lon: 13.2861, result_type: 'amenity', category: 'commercial.shopping_mall', rank: { confidence: 0.9, confidence_building_level: 1 },
      datasource: { raw: { website: 'https://place.example', phone: 'place-phone', opening_hours: 'place-hours', alt_name: 'Place alias' } }, ...extra });
    try {
      (axios as any).get = async (url: string, config: any) => {
        geoRequests.push({ url, params: config.params });
        if (geoMode === 'failure') throw { response: { status: 503 }, config: { params: { apiKey: 'test-only-secret' } } };
        if (url.includes('/geocode/search')) return { data: { results: geoMode === 'outside'
          ? [geoPlace('', { place_id: 'neuruppin', street: 'Heinrich-Rau-Straße', housenumber: '35', postcode: '16816', city: 'Neuruppin', lat: 52.9185, lon: 12.7865, result_type: 'building' })]
          : geoMode === 'outside-named' ? [geoPlace('CineStar', { street: undefined, housenumber: undefined, postcode: '15230', city: 'Frankfurt (Oder)', lat: 52.3423, lon: 14.551, category: 'entertainment.cinema', rank: { confidence: 1 } })]
          : geoMode === 'inside-empty' ? [geoPlace('Cinema Without Address', { street: undefined, housenumber: undefined, category: 'entertainment.cinema', rank: { confidence: 1 } })]
          : geoMode === 'low' ? [geoPlace('CineStar', { category: 'entertainment.cinema', rank: { confidence: 0.5 } })]
            : geoMode === 'corroborated' ? [geoPlace('UCI Am Eastgate', { category: 'entertainment.cinema', rank: { confidence: 0.75 } })]
            : geoMode === 'gropius' ? [geoPlace('UCI Kinowelt', { street: 'Johannisthaler Chaussee', housenumber: '295', postcode: '12351', category: 'entertainment.cinema', rank: { confidence: 0.5 } })]
            : geoMode === 'named' ? [geoPlace('Independent Cinema', { category: 'entertainment.cinema', rank: { confidence: 1 } })]
              : [geoPlace('Shopping centre'), geoPlace('Cafe', { category: 'catering.cafe' })] } };
        return { data: { features: [{ properties: { name: geoMode.startsWith('outside') ? 'Brandenburg' : 'Berlin', country_code: 'de',
          iso3166_2: geoMode.startsWith('outside') ? 'DE-BB' : 'DE-BE', datasource: { raw: { admin_level: 4, osm_id: 62422 } } } }] } };
      };
      const lookup = new GeoapifyGeocoder(geoStore, 'test-only-secret', { now: NOW, intervalMs: 0 });
      const geoInput = { name: 'CineStar Tegel', address: 'Am Borsigturm 2, 13507 Berlin' };
      const geoResult = await lookup.lookup(geoInput);
      assert.equal(geoResult.status, 'resolved'); assert.equal(geoResult.selected!.insideBerlin, true);
      assert.equal(geoRequests.length, 2, 'One search and one actual state-boundary lookup establish an exact address');
      assert.equal(geoRequests[0].params.text, geoInput.address, 'Use an available source address before ambiguous name searches');
      assert.equal((await new GeoapifyGeocoder(geoStore, 'test-only-secret', { now: NOW }).lookup(geoInput)).cached, true);
      assert.equal(geoRequests.length, 2, 'Reuse accepted results across runs instead of paying for the same lookup');
      const sourceGeoVenue = observation('berlin.de', 'venue', 'geo-cinema', geoInput, NOW);
      const cinemaFromAddress = await new IdentityResolver(geoStore, new DecisionEngine(geoStore, null), [], [], lookup).venue(sourceGeoVenue);
      assert.equal(cinemaFromAddress.name, 'CineStar Tegel', 'A mall or cafe at the address cannot replace the cinema identity');
      assert.equal(cinemaFromAddress.data.locationEvidence.identityEstablished, false);
      assert.equal(cinemaFromAddress.data.websiteUrl, undefined);
      assert.equal(cinemaFromAddress.data.phone, undefined); assert.equal(cinemaFromAddress.data.openingHours, undefined);
      assert.equal(cinemaFromAddress.data.aliases, undefined, 'Business identity fields from a mall address must not be copied onto the cinema'); checks += 3;
      geoMode = 'outside'; const outsideInput = { name: 'Union Filmtheater Neuruppin', address: 'Heinrich-Rau-Straße 35, 16816 Neuruppin' };
      const geoOutside = await lookup.lookup(outsideInput);
      assert.equal(geoOutside.selected!.insideBerlin, false);
      assert.equal(geoRequests.find(request => request.params.text?.includes('Neuruppin'))!.params.text, outsideInput.address, 'Never force an outside venue into a Berlin-only search');
      const outsideResolved = await new IdentityResolver(geoStore, new DecisionEngine(geoStore, null), [], [], lookup).venue(observation('berlin.de', 'venue', 'geo-outside', outsideInput, NOW));
      assert.equal(outsideResolved.data.insideBerlin, false);
      assert.equal(geoStore.issues().some(issue => issue.subject.includes('geo-outside') && issue.type === 'venue-location'), false);
      geoMode = 'outside-named';
      const outsidePoint = await lookup.lookup({ name: 'Cinestar', explicitCity: 'Frankfurt (Oder)', search: 'name' });
      assert.equal(outsidePoint.status, 'resolved'); assert.equal(outsidePoint.selected!.insideBerlin, false);
      assert.equal(outsidePoint.selected!.address, ''); assert.equal(outsidePoint.selected!.postalCode, '15230');
      assert.ok(outsidePoint.selected!.raw, 'Retain all returned place evidence, including partial structured addresses');
      geoMode = 'inside-empty';
      const missingStreet = await lookup.lookup({ name: 'Cinema Without Address', explicitCity: 'Berlin' });
      assert.equal(missingStreet.status, 'low-confidence'); assert.equal(missingStreet.selected, undefined); checks += 7;
      geoMode = 'named'; const named = await lookup.lookup({ name: 'Independent Cinema' });
      assert.equal(named.status, 'resolved');
      assert.equal(geoRequests.find(request => request.params.name === 'Independent Cinema')!.params.type, 'amenity');
      const oldNameKey = 'geoapify:venue:name-v2:' + fingerprint({ name: 'Rollberg Kinos', address: '', explicitCity: 'Berlin' });
      geoStore.saveResource(oldNameKey, { status: 'low-confidence', reason: 'Previous rules did not recognize the plural name',
        candidates: [{ ...named.selected, name: 'Rollberg Kino', nameMatches: false, raw: undefined }], fetchedAt: NOW }, NOW);
      const beforeRevalidation = geoRequests.length;
      const revalidated = await lookup.lookup({ name: 'Rollberg Kinos', explicitCity: 'Berlin' });
      assert.equal(revalidated.status, 'resolved', 'Old cached derived match decisions are re-evaluated using the retained provider evidence');
      assert.equal(revalidated.cached, true); assert.equal(geoRequests.length, beforeRevalidation, 'Revalidation must not pay for the same search again');
      assert.equal(revalidated.fetchedAt, NOW, 'Revalidation retains the actual provider fetch timestamp'); checks += 4;
      const fallbackStore = new PipelineStore(':memory:'); const fallbackInputs: any[] = [];
      const fallbackSource = observation('berlin.de', 'venue', 'fallback-name', { name: 'Independent Cinema', address: 'Am Borsigturm 2, 13506 Berlin', explicitCity: 'Berlin' }, NOW);
      const fallbackResolver = new IdentityResolver(fallbackStore, new DecisionEngine(fallbackStore, null), [], [], { lookup: async (input: any) => {
        fallbackInputs.push(input); return input.search === 'name' ? named : { status: 'low-confidence', candidates: [], reason: 'Wrong source postcode' };
      } });
      const fallbackVenue = await fallbackResolver.venue(fallbackSource);
      assert.equal(fallbackVenue.data.address, named.selected!.address, 'A verified named cinema can correct a source postcode after address search fails');
      assert.equal(fallbackInputs.length, 2); assert.equal(fallbackInputs[1].address, fallbackSource.data.address, 'Retain the source address as corroborating evidence without putting it into the name search');
      assert.equal(fallbackStore.issues().some(issue => issue.status === 'open'), false);
      assert.equal(geoNameMatches('Rollberg Kinos', { name: 'Rollberg Kino' }), true);
      assert.equal(geoNameMatches('UCI Kinowelt Am Eastgate', { name: 'UCI Am Eastgate' }, true), true);
      assert.equal(geoNameMatches('UCI Kinowelt Am Eastgate', { name: 'UCI Am Eastgate' }), false, 'Descriptor omission needs independent address corroboration');
      assert.equal(geoNameMatches('UCI Kinowelt Am Eastgate', { name: 'UCI Gropius Passagen' }, true), false, 'Branch names are never discarded'); checks += 8;
      geoMode = 'corroborated';
      const corroborated = await lookup.lookup({ name: 'UCI Kinowelt Am Eastgate', address: geoInput.address, explicitCity: 'Berlin', search: 'name' });
      assert.equal(corroborated.status, 'resolved', 'A unique named cinema with the exact full source address is independent proof despite a lower text-match rank');
      assert.equal(corroborated.selected!.confidence, 0.75, 'Retain the actual provider score without upgrading it');
      const nameSearch = geoRequests.find(request => request.params.name === 'UCI Kinowelt Am Eastgate')!.params;
      assert.equal(nameSearch.text, undefined); assert.equal(nameSearch.city, 'Berlin');
      const otherHouse = await lookup.lookup({ name: 'UCI Kinowelt Am Eastgate', address: 'Am Borsigturm 20, 13507 Berlin', explicitCity: 'Berlin', search: 'name' });
      assert.equal(otherHouse.status, 'low-confidence', 'An unmatched house number cannot corroborate a descriptive name variant'); checks += 5;
      const duplicateVenueStore = new PipelineStore(':memory:');
      for (const id of ['old-a', 'old-b']) duplicateVenueStore.saveEntity({ id, kind: 'venue', name: 'UCI Kinowelt Am Eastgate', data: { address: geoInput.address, insideBerlin: true } });
      const duplicateVenueResolver = new IdentityResolver(duplicateVenueStore, new DecisionEngine(duplicateVenueStore, null), [], [], { lookup: async () => corroborated });
      const eastgateA = await duplicateVenueResolver.venue(observation('critic.de', 'venue', 'eastgate', { name: 'UCI Kinowelt Am Eastgate', address: geoInput.address }, NOW));
      const eastgateB = await duplicateVenueResolver.venue(observation('berlin.de', 'venue', 'eastgate', { name: 'UCI Kinowelt am Eastgate', address: geoInput.address }, NOW));
      assert.equal(eastgateA.id, eastgateB.id, 'Existing records at the same independently verified cinema address converge');
      assert.equal(eastgateA.name, eastgateB.name, 'Source capitalization cannot create two display names for one physical cinema'); checks += 2;
      assert.equal(geoNameMatches('UCI Kinowelt Gropius Passagen', { name: 'UCI Kinowelt' }, true), true, 'A map label may omit a branch suffix at a corroborated full address');
      assert.equal(geoNameMatches('UCI Kinowelt Gropius Passagen', { name: 'UCI Kinowelt' }), false);
      const renamed = { name: 'UCI Luxe East Side Gallery', other_names: { short_name: 'UCI;UCI Luxe' } };
      assert.equal(geoNameMatches('UCI Luxe Mercedes Platz', renamed, true), true, 'Provider short-name aliases can corroborate a rename at the same verified full address');
      assert.equal(geoNameMatches('UCI Luxe Mercedes Platz', renamed), false, 'A brand alias without address corroboration cannot identify a branch'); checks += 2;
      assert.equal(geoNameMatches('Example Cinema', { name: 'Cinema' }, true), false, 'A generic label alone is not a cinema identity');
      geoMode = 'gropius';
      const gropiusSource = observation('berlin.de', 'venue', 'gropius', { name: 'UCI Kinowelt Gropius Passagen', address: 'Johannesthaler Chaussee 295, 12351 Berlin - Neukölln', explicitCity: 'Berlin', addressEvidence: { status: 'resolved', reason: 'Source page address' } }, NOW);
      const gropiusPeer = observation('critic.de', 'venue', 'gropius', { name: 'UCI KINOWELT Gropius Passagen', address: 'Johannisthaler Chaussee 295, 12351 Berlin' }, NOW);
      geoStore.observe(gropiusSource); geoStore.observe(gropiusPeer);
      const gropiusQuery = { ...gropiusSource.data, search: 'name' as const } as any;
      assert.equal((await lookup.lookup(gropiusQuery)).status, 'low-confidence', 'A source street typo by itself is not independent corroboration');
      const beforeCorroboration = geoRequests.length;
      flag(geoStore, 'venue-geocoding', gropiusSource.subject, 'Review location lookup: Gropius', { observation: gropiusSource });
      const gropiusResolver = new IdentityResolver(geoStore, new DecisionEngine(geoStore, null), [], [], lookup);
      const verifiedGropius = await gropiusResolver.venue(gropiusSource);
      assert.equal(verifiedGropius.data.address, gropiusPeer.data.address, 'Use the map address corroborated exactly by another current source');
      assert.equal(verifiedGropius.name, gropiusSource.data.name, 'Keep the full cinema branch name when the API shortens it');
      assert.equal(verifiedGropius.data.locationEvidence.identityEstablished, true);
      assert.equal(verifiedGropius.data.locationEvidence.addressEvidence[0].subject, gropiusPeer.subject);
      assert.equal(verifiedGropius.data.locationEvidence.confidence, 0.5, 'Do not inflate the actual provider score');
      const automaticLocation = geoStore.issues().find(issue => issue.subject === gropiusSource.subject && issue.type === 'venue-geocoding')!;
      assert.equal(automaticLocation.status, 'caution'); assert.match(automaticLocation.details.resolution, /Another current source/);
      assert.equal((await gropiusResolver.venue(gropiusSource)).id, verifiedGropius.id, 'A corrected source typo remains stable on the next resolution');
      assert.equal(geoRequests.length, beforeCorroboration + 1, 'Reuse previous searches and boundary evidence; only the uncached address search is needed');
      assert.equal((await lookup.lookup(gropiusQuery)).status, 'low-confidence', 'Removing corroboration invalidates a derived cached acceptance');
      assert.equal((await lookup.lookup({ ...gropiusQuery, address: 'Johannesthaler Chaussee 296, 12351 Berlin', corroboratingAddresses: [{ subject: gropiusPeer.subject, source: 'critic.de', address: gropiusPeer.data.address }] })).status, 'low-confidence', 'A different house number cannot be repaired as a street typo');
      const otherBranch = observation('berlin.de', 'venue', 'other-branch', { ...gropiusSource.data, name: 'UCI Kinowelt Am Eastgate' }, NOW);
      assert.equal((await gropiusResolver.venue(otherBranch)).data.locationEvidence, undefined, 'Another branch cannot borrow corroboration from a differently named source');
      const staleStore = new PipelineStore(':memory:');
      staleStore.observe({ ...gropiusPeer, observedAt: '2026-10-13T10:00:00Z' });
      const staleResolver = new IdentityResolver(staleStore, new DecisionEngine(staleStore, null), [], [], lookup);
      assert.equal((await staleResolver.venue(gropiusSource)).data.locationEvidence, undefined, 'Old source addresses cannot corroborate a new lookup'); checks += 17;
      const changedStore = new PipelineStore(':memory:');
      const changedSource = observation('berlin.de', 'venue', 'changed-venue', { name: 'Independent Cinema', address: 'Wrong Street 17, 10115 Berlin', explicitCity: 'Berlin' }, NOW);
      changedStore.saveEntity({ id: 'previous-venue', kind: 'venue', name: 'Independent Cinema', data: { address: 'Old Street 19, 10115 Berlin', insideBerlin: true, osmId: 'osm/old' } });
      changedStore.saveLink(changedSource.subject, 'previous-venue', 'older-evidence', 'venue-evidence');
      let nameQuery: any;
      const changedResolver = new IdentityResolver(changedStore, new DecisionEngine(changedStore, null), [],
        [{ address: changedSource.data.address, insideBerlin: true }], { lookup: async input => { nameQuery = input; return named; } });
      const correctedAddress = await changedResolver.venue(changedSource);
      assert.equal(nameQuery.address, undefined, 'A changed address is verified by cinema name, even if the supplied address exists in OSM');
      assert.equal(nameQuery.name, 'Independent Cinema'); assert.equal(nameQuery.explicitCity, 'Berlin');
      assert.equal(correctedAddress.data.address, named.selected!.address, 'The verified cinema address supersedes an incorrect source address');
      assert.equal(changedStore.issues().some(issue => issue.status === 'open'), false);
      const failedChangedSource = observation('berlin.de', 'venue', 'failed-address-change', changedSource.data, NOW);
      changedStore.saveLink(failedChangedSource.subject, 'previous-venue', 'older-evidence', 'venue-evidence');
      const unresolvedAddress = await new IdentityResolver(changedStore, new DecisionEngine(changedStore, null), [],
        [{ address: changedSource.data.address, insideBerlin: true }], { lookup: async () => ({ status: 'ambiguous', candidates: [], reason: 'Multiple cinema branches' }) }).venue(failedChangedSource);
      assert.equal(unresolvedAddress.data.insideBerlin, false, 'A plausible source address cannot bypass a failed cinema-name lookup after an address change');
      assert.ok(changedStore.issues().some(issue => issue.subject === failedChangedSource.subject && issue.status === 'open' && issue.details.geocoding.status === 'ambiguous')); checks += 7;
      geoMode = 'low'; const low = await lookup.lookup({ name: 'CineStar Tegel' });
      assert.equal(low.status, 'low-confidence'); assert.equal(low.selected, undefined, 'A highly ranked brand search is not a verified branch');
      const geoIssue = flag(geoStore, 'venue-geocoding', sourceGeoVenue.subject, 'Inspect location API evidence', { observation: sourceGeoVenue, geocoding: low });
      const geoPresentation = reviewEvidence(geoStore, geoIssue);
      const geoColumn = geoPresentation.columns.find(column => column.id.startsWith('geoapify-result:'))!;
      assert.deepEqual(geoColumn.fields.address, ['Am Borsigturm 2, 13507 Berlin']);
      assert.deepEqual(geoColumn.fields.locationConfidence, [0.5], 'Unaccepted provider evidence stays visible for comparison');
      assert.equal(geoPresentation.fields.find(field => field.key === 'locationConfidence')!.secondary, true); checks += 3;
      const noBudget = await new GeoapifyGeocoder(geoStore, 'test-only-secret', { now: NOW, maxRequests: 0 }).lookup({ name: 'Uncached cinema' });
      assert.equal(noBudget.status, 'budget-exhausted');
      geoMode = 'failure'; const failedGeo = await new GeoapifyGeocoder(geoStore, 'test-only-secret', { now: NOW }).lookup({ name: 'Failed lookup' });
      assert.equal(failedGeo.status, 'request-failed'); assert.ok(failedGeo.reason.includes('503'));
      assert.equal(JSON.stringify(failedGeo).includes('test-only-secret'), false, 'Provider secrets never enter persisted errors or lookup evidence');
      assert.equal(berlinBoundary([{ properties: { name: 'Berlin', country_code: 'de', datasource: { raw: { admin_level: 10 } } } }]), null, 'A same-named district is not Berlin state boundary evidence');
      checks += 22;
    } finally { axios.get = beforeGeoGet; }

    const decisionStore = new PipelineStore(':memory:'); decisionStore.acquireLease('decision');
    const request: DecisionRequest = { task: 'film', state: { title: 'A Film' }, questions: { resolution: {
      instructions: 'Choose', choices: { same: 'Same identity', different: 'Distinct identity', insufficient: 'Cannot determine' },
    } } };
    let calls = 0;
    const cachedModel = model(() => { calls++; return 'insufficient'; });
    const decisions = new DecisionEngine(decisionStore, cachedModel);
    await decisions.decide(request); assert.equal((await decisions.decide(request)).cached, true); assert.equal(calls, 1);
    await decisions.decide({ ...request, state: { title: 'Changed film' } }); assert.equal(calls, 2, 'Changed evidence invalidates decision cache');
    const limited = new DecisionEngine(decisionStore, model(() => 'same'), { monthlyLimitUsd: 0 });
    assert.equal((await limited.decide({ ...request, state: { title: 'Budget' } })).accepted, false);
    assert.equal(calls, 2); checks += 5;
    await decisions.decide({ ...request, state: { title: 'A Film', observedAt: '2026-10-16T00:00:00Z' } });
    await decisions.decide({ ...request, state: { title: 'A Film', observedAt: '2026-10-17T00:00:00Z' } });
    assert.equal(calls, 2, 'Repeated source observation timestamps do not invalidate unchanged decision evidence'); checks++;
    const invalid = answer(request, 'same'); invalid.answers.resolution.probabilities = { same: 1 };
    assert.throws(() => validateAnswers(request, invalid.answers));
    const malicious = answer(request, 'invented-id'); assert.throws(() => validateAnswers(request, malicious.answers)); checks += 2;
    const failedModel: DecisionModel = { ...model(() => 'same'), decide: async () => { throw new Error('Provider timeout'); } };
    const priorSpend = decisionStore.spend();
    assert.equal((await new DecisionEngine(decisionStore, failedModel).decide({ ...request, state: { timeout: true } })).accepted, false);
    assert.ok(decisionStore.spend() > priorSpend, 'Uncertain provider billing retains reservation'); checks += 2;

    const evidenceStore = new PipelineStore(':memory:');
    const sourceEvidence = observation('critic.de', 'listing', 'evidence', { title: 'Example Film', rawTitle: 'Example Film', director: 'Director A', year: null, url: 'https://example.test/a' }, NOW);
    const relatedEvidence = observation('berlin.de', 'listing', 'evidence', { title: 'Example Film', rawTitle: 'Example Film', director: null, year: null, url: 'https://example.test/b' }, NOW);
    evidenceStore.observe(sourceEvidence); evidenceStore.observe(relatedEvidence);
    evidenceStore.saveEntity({ id: 'evidence-film', kind: 'film', name: 'Example Film', data: { director: 'Director A' } });
    evidenceStore.saveLink(sourceEvidence.subject, 'evidence-film', linkEvidence(sourceEvidence), 'provisional');
    const evidenceIssue = flag(evidenceStore, 'metadata-match', 'metadata:evidence-film', 'Resolve metadata: Example Film', {
      entityId: 'evidence-film', listing: { title: 'Example Film', director: 'Director A', year: null },
      candidates: [{ id: 123, title: 'Example Film', director: 'Director A', year: 2026 }],
      decision: { accepted: false, response: null, reason: 'No decision provider configured' },
    });
    const presentation = reviewEvidence(evidenceStore, evidenceIssue);
    assert.deepEqual(presentation.columns.filter(c => c.kind === 'source').map(c => c.label), ['critic.de', 'berlin.de']);
    assert.equal(presentation.columns.find(c => c.label === 'berlin.de')!.records[0].related, true, 'Unlinked context is labelled, not silently accepted');
    assert.equal(presentation.columns.find(c => c.label === 'critic.de')!.records[0].related, false);
    assert.equal(evidenceStore.link(relatedEvidence.subject), null, 'Viewing comparison cannot merge records');
    assert.equal(comparisonStatus('year', presentation.columns), 'missing', 'Missing year is distinct from contradicting years');
    assert.equal(comparisonStatus('director', presentation.columns), 'missing');
    assert.ok(presentation.reasons.some(r => r.code === 'provider-not-configured'));
    assert.ok(presentation.reasons.some(r => r.code === 'missing-data'));
    assert.equal(presentation.reasons.some(r => r.code === 'low-confidence'), false, 'No model call is not low confidence');
    assert.equal(presentation.metrics.length, 0);
    assert.equal(presentation.options.find(o => o.id === 'metadata:123')!.values.tmdbId, 123);
    assert.equal(presentation.options.find(o => o.id === 'metadata:none')!.values.tmdbId, null); checks += 12;
    const contradictory = structuredClone(presentation.columns); contradictory.find(c => c.label === 'berlin.de')!.fields.year = [1994];
    assert.equal(comparisonStatus('year', contradictory), 'conflict');
    const lowConfidence = reviewEvidence(evidenceStore, { ...evidenceIssue, details: { ...evidenceIssue.details,
      decision: { code: 'low-confidence', accepted: false, threshold: 0.97, response: { answers: { identity: { choice: '123', confidence: 0.8, probabilities: { '123': 0.9 } } } } },
      retrievalErrors: [{ route: '/movie/456', status: 503, reason: 'TMDb HTTP 503' }],
    } });
    assert.ok(lowConfidence.reasons.some(r => r.code === 'low-confidence'));
    assert.ok(lowConfidence.reasons.some(r => r.code === 'verification-api-failed' && r.detail.includes('503')));
    assert.deepEqual(lowConfidence.metrics[0], { question: 'identity', choice: '123', confidence: 0.8, probability: 0.9, threshold: 0.97 }); checks += 4;
    const nonunique = reviewEvidence(evidenceStore, { ...evidenceIssue, details: { ...evidenceIssue.details,
      listing: { title: 'Example Film', director: 'Director A', year: 2026 }, candidates: [
        { id: 123, title: 'Example Film', director: 'Director A', year: 2026 }, { id: 456, title: 'Example Film', director: 'Director A', year: 2026 },
      ],
    } });
    assert.ok(nonunique.reasons.some(reason => reason.code === 'nonunique-match'));
    const translated = reviewEvidence(evidenceStore, { ...evidenceIssue, details: { ...evidenceIssue.details,
      listing: { title: 'Translated title', titles: ['Example Film'], director: 'Director A', year: 2026 },
    } });
    assert.equal(translated.checks.find(check => check.label === 'Title')!.status, 'passed', 'Explain the real title rule, including source alternate titles'); checks += 2;
    evidenceStore.saveResource('tmdb-enrichment:123', { tmdbTitle: 'Example Film', releaseYear: 2026, plot: 'Database plot' }, NOW);
    evidenceStore.saveFields('evidence-film', [{ field: 'plot', value: 'Database plot', source: 'TMDb:123', observationId: null,
      observedAt: NOW, selectedAt: NOW, reason: 'Verified external identity', identityVerified: true }]);
    const withEnrichment = reviewEvidence(evidenceStore, evidenceIssue);
    assert.deepEqual(withEnrichment.columns.find(column => column.id === 'provenance:TMDb:123')!.fields.plot, ['Database plot']);
    assert.equal(withEnrichment.columns.find(column => column.label === 'critic.de')!.fields.plot, undefined, 'Enrichment must not masquerade as source extraction'); checks += 2;

    const identityEvidenceStore = new PipelineStore(':memory:');
    const lalkaUrl = 'https://www.critic.de/ov-movies-berlin/movie/lalka-422418/';
    const lalkaCurrent = observation('critic.de', 'listing', 'lalka-current', { title: 'Lalka (The Doll)', rawTitle: 'Lalka (The Doll) (OmU)', url: lalkaUrl }, NOW);
    const lalkaEarlier = observation('critic.de', 'listing', 'lalka-earlier', { title: 'Lalka', rawTitle: 'Lalka', url: lalkaUrl }, NOW);
    const lalkaBerlin = observation('berlin.de', 'listing', 'lalka-berlin', { title: 'Lalka', rawTitle: 'Lalka (OmenglU)', url: 'https://www.berlin.de/kino/_bin/filmdetail.php/317038' }, NOW);
    for (const item of [lalkaEarlier, lalkaCurrent, lalkaBerlin]) identityEvidenceStore.observe(item);
    identityEvidenceStore.retireMissing('critic.de', new Set([lalkaCurrent.subject]));
    const lalkaCandidates = [lalkaEarlier, lalkaBerlin].map((item, i) => {
      const entity = { id: `lalka-${i}`, kind: 'film' as const, name: 'Lalka', data: { sourceUrls: [item.data.url] } };
      identityEvidenceStore.saveEntity(entity); identityEvidenceStore.saveLink(item.subject, entity.id, linkEvidence(item), 'provisional'); return entity;
    });
    const lalkaIssue = flag(identityEvidenceStore, 'film-match', lalkaCurrent.subject, 'Resolve film identity: Lalka (The Doll)', {
      observation: lalkaCurrent, parsed: parseLabel(lalkaCurrent.data.rawTitle), candidates: lalkaCandidates,
      decision: { accepted: false, code: 'provider-not-configured', response: null, reason: 'No decision provider configured' },
    });
    const lalkaComparison = reviewEvidence(identityEvidenceStore, lalkaIssue);
    assert.equal(lalkaComparison.layout, 'identity');
    assert.equal(lalkaComparison.columns.length, 3, 'The current entry and each existing identity have separate columns');
    assert.deepEqual(lalkaComparison.columns.map(c => c.label), ['critic.de · current entry', 'critic.de · earlier record', 'berlin.de · existing record']);
    assert.deepEqual(lalkaComparison.columns.map(c => c.fields.title), [['Lalka (The Doll)'], ['Lalka'], ['Lalka']]);
    assert.deepEqual(lalkaComparison.columns.map(c => c.fields.sourceFilmUrl), [[lalkaUrl], [lalkaUrl], [lalkaBerlin.data.url]], 'Historic source page evidence remains available beside the current entry');
    assert.equal(lalkaComparison.fields.find(f => f.key === 'sourceFilmUrl')!.secondary, false);
    assert.equal(lalkaComparison.fields.find(f => f.key === 'rawTitle')!.secondary, true, 'Keep the initial identity comparison focused on distinguishing facts');
    assert.equal(comparisonStatus('sourceFilmUrl', lalkaComparison.columns), 'different', 'Different source sites are not an identity contradiction');
    assert.equal(comparisonStatus('year', lalkaComparison.columns), 'empty');
    assert.ok(lalkaComparison.reasons.some(r => r.code === 'shared-source-page'));
    assert.ok(lalkaComparison.reasons.some(r => r.code === 'missing-data'));
    assert.ok(lalkaComparison.reasons.some(r => r.code === 'provider-not-configured'));
    assert.notEqual(lalkaComparison.options[0].label, lalkaComparison.options[1].label, 'Same-title choices identify which source record will be linked');
    assert.equal(identityEvidenceStore.link(lalkaCurrent.subject), null, 'Presenting a shared URL never changes identity links'); checks += 14;

    let sent: any;
    const cf = new HttpDecisionModel({ provider: 'cloudflare', model: 'clef-flash', apiKey: 'test-only', accountId: 'test-account', inputUsdPerMillion: 0.038 },
      (async (url: any, init: any) => { sent = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ success: true, result: { answers: answer(request, 'same').answers, usage: { input_tokens: 50 } } })); }) as typeof fetch);
    assert.equal((await cf.decide(request)).answers.resolution.choice, 'same'); assert.ok(sent.url.endsWith('/@cf/cloudflare/clef-flash'));
    assert.equal(sent.body.questions.resolution.type, 'choice'); checks += 3;

    const screeningStore = new PipelineStore(':memory:'); screeningStore.acquireLease('screening');
    const a = observation('a', 'screening', '1', { date: '2026-10-16', time: '20:00', url: 'https://example.test' }, NOW);
    const b = observation('b', 'screening', '2', { date: '2026-10-16', time: '20:00', url: 'https://example.test' }, NOW);
    const inputs = [{ observation: a, filmId: 'f', venueId: 'v', cinema: 'Cinema', modality: parseMarkers('OV')!, stale: false },
      { observation: b, filmId: 'f', venueId: 'v', cinema: 'Cinema', modality: parseMarkers('DF')!, stale: false }];
    const unresolved = await resolveScreenings(screeningStore, new DecisionEngine(screeningStore, null), inputs);
    assert.equal(unresolved.length, 1); assert.equal(unresolved[0].uncertain, false); assert.deepEqual(unresolved[0].variants, []);
    const modelResolved = await resolveScreenings(screeningStore, new DecisionEngine(screeningStore, model(() => { throw new Error('Same-viewing resolution must not call a model'); })), inputs);
    assert.equal(modelResolved[0].uncertain, false); assert.deepEqual(modelResolved[0].variants, []);
    assert.equal(screeningStore.issues().length, 0); checks += 6;
    assert.equal(matchesFilters({ cinema: 'Cinema', variants: [], uncertain: true }, ['Cinema'], ['OV'], false), false);
    assert.equal(matchesFilters({ cinema: 'Cinema', variants: [], uncertain: true }, ['Cinema'], ['OV'], true), true); checks += 2;

    {
      const compatibleStore = new PipelineStore(':memory:'); compatibleStore.acquireLease('compatible-screenings');
      let compatibleCalls = 0;
      const compatibleEngine = new DecisionEngine(compatibleStore, model(() => { compatibleCalls++; return 'insufficient'; }));
      const compatibleInputs = ['OmenglU', 'OmU'].map((variant, index) => ({
        ...inputs[index], modality: parseMarkers(variant)!, observation: observation('berlin.de', 'screening', `compatible-${index}`, {
          rawTitle: `The Illusion of a Quiet Night (${variant})`, cinema: 'Cosima-Filmtheater', date: '2026-10-18', time: '20:00', variant,
        }, NOW),
      }));
      const oldScreeningIssue = flag(compatibleStore, 'screening-conflict', `slot:${identity('screening', 'f|v|2026-10-18|20:00')}`, 'Previous screening review', {
        observations: compatibleInputs.map(input => input.observation), alternatives: compatibleInputs.map(input => input.modality),
      });
      const screeningEvidence = reviewEvidence(compatibleStore, oldScreeningIssue);
      assert.equal(screeningEvidence.layout, 'screening');
      assert.deepEqual(screeningEvidence.columns.map(column => column.label), ['Entry 1', 'Entry 2'], 'Same-source entries must remain separate columns');
      assert.deepEqual(screeningEvidence.columns.map(column => column.source), ['berlin.de', 'berlin.de']);
      assert.deepEqual(screeningEvidence.columns.map(screeningSubtitles), ['English (OmenglU)', 'Language unspecified (OmU)']);
      assert.equal(comparisonStatus('subtitleLanguage', screeningEvidence.columns), 'missing', 'Unknown is not an explicitly different subtitle language');
      assert.equal(comparisonStatus('title', screeningEvidence.columns), 'same');
      assert.equal(comparisonValue('original', 'version'), 'Original');
      assert.ok(screeningEvidence.options[0].label.includes('English subtitles'));
      assert.ok(screeningEvidence.fields.find(field => field.key === 'rawTitle')?.secondary);
      compatibleStore.beginReviewPass();
      const combined = await resolveScreenings(compatibleStore, compatibleEngine, compatibleInputs);
      compatibleStore.endReviewPass(NOW);
      assert.equal(combined.length, 1); assert.equal(combined[0].uncertain, false);
      assert.deepEqual(combined[0].variants, ['OmeU']); assert.equal(combined[0].observationIds.length, 2);
      assert.equal(compatibleCalls, 0, 'Compatible descriptions must not incur a model request');
      assert.equal(compatibleStore.issues().filter(issue => issue.status === 'open').length, 0, 'An old compatible-description flag leaves the review queue');
      assert.equal(compatibleStore.issues()[0].details.resolutionCode, 'same-viewing');
      const reversed = await resolveScreenings(compatibleStore, compatibleEngine, [...compatibleInputs].reverse());
      assert.deepEqual(reversed[0].modality, combined[0].modality, 'More precise evidence is retained regardless of input order');
      const separateHalls = compatibleInputs.map((input, index) => ({ ...input,
        observation: { ...input.observation, data: { ...input.observation.data, auditorium: `Hall ${index + 1}` } } }));
      assert.equal((await resolveScreenings(compatibleStore, compatibleEngine, separateHalls)).length, 1, 'The same film, cinema, date and time is one viewing even with different hall labels');
      const english = parseMarkers('OmenglU')!;
      for (const contradictory of [{ ...english, subtitleLanguage: 'de' }, { ...emptyModality(), subtitled: false }, parseMarkers('DF')!,
        { ...english, edition: 'Extended cut' }]) {
        const base = contradictory.edition ? { ...english, edition: 'Theatrical cut' } : english;
        const result = await resolveScreenings(compatibleStore, new DecisionEngine(compatibleStore, null),
          compatibleInputs.map((input, index) => ({ ...input, modality: index ? contradictory : base })));
        assert.equal(result[0].uncertain, false, 'Description contradictions do not change viewing identity or require review');
      }
      for (const [left, right] of [['2D', '3D'], ['35 mm', '70 mm']]) {
        const result = await resolveScreenings(compatibleStore, new DecisionEngine(compatibleStore, null),
          compatibleInputs.map((input, index) => ({ ...input, modality: parseMarkers(index ? right : left)! })));
        assert.equal(result[0].uncertain, false, 'Projection disagreements do not split one viewing');
        assert.deepEqual(result[0].modality.projection, [], 'Conflicting projection details remain unspecified'); checks++;
      }
      const delphiInputs = compatibleInputs.map((input, index) => ({ ...input, cinema: 'Delphi LUX',
        modality: parseMarkers(index ? 'OmU' : 'DFmEnglU')!,
        observation: { ...input.observation, data: { ...input.observation.data, date: '2026-10-16', time: '21:15', sessionId: `session-${index}` } },
      }));
      const delphi = await resolveScreenings(compatibleStore, compatibleEngine, delphiInputs);
      assert.equal(delphi.length, 1); assert.equal(delphi[0].uncertain, false);
      assert.equal(delphi[0].modality.version, 'unknown');
      assert.equal(delphi[0].modality.spokenLanguage, 'de');
      assert.equal(delphi[0].modality.subtitleLanguage, 'en');
      assert.equal(delphi[0].observationIds.length, 2);
      assert.equal(delphi[0].alternatives?.length, 2);
      assert.deepEqual((await resolveScreenings(compatibleStore, compatibleEngine, [...delphiInputs].reverse()))[0].modality, delphi[0].modality);
      for (const change of [{ filmId: 'other-film' }, { venueId: 'other-cinema' },
        { observation: { ...delphiInputs[1].observation, data: { ...delphiInputs[1].observation.data, date: '2026-10-17' } } },
        { observation: { ...delphiInputs[1].observation, data: { ...delphiInputs[1].observation.data, time: '21:30' } } }]) {
        assert.equal((await resolveScreenings(compatibleStore, compatibleEngine, [delphiInputs[0], { ...delphiInputs[1], ...change }])).length, 2,
          'A different film, cinema, date or time remains a different viewing'); checks++;
      }
      assert.equal(compatibleCalls, 0, 'Same-viewing resolution never calls the model');
      assert.equal(compatibleStore.issues().filter(issue => issue.status === 'open').length, 0); checks += 10;
      const explicitGerman = structuredClone(screeningEvidence.columns); explicitGerman[1].fields.subtitleLanguage = ['de'];
      assert.equal(comparisonStatus('subtitleLanguage', explicitGerman), 'conflict');
      const noSubtitles = structuredClone(screeningEvidence.columns); noSubtitles[1].fields.subtitled = [false];
      assert.equal(comparisonStatus('subtitleLanguage', noSubtitles), 'conflict'); checks += 25;
    }

    const reviewStore = new PipelineStore(':memory:');
    await execute(reviewStore, [batch('a', [raw('A Film (The Translation)')])]);
    const issue = reviewStore.issues().find(i => i.type === 'label-interpretation')!;
    const parsed = parseLabel('A Film'); parsed.year = 2026;
    const command = { issueId: issue.id, action: 'parse' as const, reason: 'Source confirms alternate title', revision: reviewStore.revision,
      evidenceFingerprint: issue.fingerprint, values: parsed };
    assert.ok(previewReview(reviewStore, command).description);
    const correction = applyReview(reviewStore, command);
    assert.throws(() => applyReview(reviewStore, command), ReviewConflict, 'Stale admin tabs cannot overwrite newer decisions');
    assert.equal((await execute(reviewStore)).movies[0].title, 'A Film', 'Parsing corrections must update the published identity label');
    reviewStore.revokeOverride(correction.overrideIds[0]);
    assert.equal((await execute(reviewStore)).movies[0].title, 'A Film (The Translation)', 'Undo reconstructs the original interpretation'); checks += 4;
    const manualField = reviewStore.addOverride({ subject: `entity:${reviewStore.link(issue.subject)!.entityId}`, action: 'patch',
      patch: { fields: { plot: 'Manually supplied plot' } }, reason: 'Review fixture', actor: 'test', evidenceFingerprint: issue.fingerprint });
    assert.equal((await execute(reviewStore)).movies[0].plot, 'Manually supplied plot');
    reviewStore.revokeOverride(manualField.id);
    assert.equal((await execute(reviewStore)).movies[0].plot, null, 'Undo must not retain the revoked manual value as historical fallback'); checks += 2;
    const undoStore = new PipelineStore(':memory:'); const undoInitial = await execute(undoStore, [batch('a')]);
    const source = undoStore.observations().find(o => o.kind === 'listing')!;
    undoStore.saveEntity({ id: 'wrong-target', kind: 'film', name: 'Different Film', data: { year: 2026, director: 'Other Person' } });
    const linkIssue = flag(undoStore, 'film-match', source.subject, 'Review link', { observation: source }, 'open', 80, linkEvidence(source));
    const linked = applyReview(undoStore, { issueId: linkIssue.id, action: 'link', targetId: 'wrong-target', reason: 'Explicit test link',
      revision: undoStore.revision, evidenceFingerprint: linkIssue.fingerprint });
    assert.equal((await execute(undoStore)).movies[0].title, 'Different Film');
    undoStore.revokeOverride(linked.overrideIds[0]);
    assert.equal((await execute(undoStore)).movies[0].id, undoInitial.movies[0].id, 'Undo a manual identity link by rebuilding materialized links'); checks += 2;

    const verifiedStore = new PipelineStore(':memory:'); let chosenId: number | null = null;
    const tmdb: any = { candidates: async () => [
      { id: 1980, title: 'A Film', original_title: 'A Film', release_date: '1980-01-01' },
      { id: 2026, title: 'A Film', original_title: 'A Film', release_date: '2026-01-01' },
    ], getMovieDetails: async () => ({ credits: { crew: [{ job: 'Director', name: 'Director A' }] }, externalIds: {} }),
    enrichSelected: async (id: number) => { chosenId = id; return { tmdbTitle: 'A Film', originalTitle: 'A Film', releaseYear: 2026, director: 'Director A', plot: 'Verified plot', imdbId: 'tt1234567' }; } };
    const verified = await execute(verifiedStore, [batch('a')], { tmdb });
    assert.equal(chosenId, 2026, 'Reject conflicting release years before metadata acceptance');
    assert.equal(verified.movies[0].plot, 'Verified plot');
    const fromHistory = await execute(verifiedStore, undefined, { tmdb: null });
    assert.equal(fromHistory.movies[0].plot, 'Verified plot', 'A verified provisional source identity must retain compatible enrichment when the provider is unavailable');
    const replaced = await execute(verifiedStore, [batch('a', [raw('A Film', '1980', { director: 'Other Person' })])], { tmdb: null });
    assert.equal(replaced.movies[0].plot, null, 'New source identity cannot inherit the previous film metadata');
    assert.notEqual(replaced.movies[0].slug, verified.movies[0].slug, 'A replacement work cannot steal a reserved public URL'); checks += 5;

    {
      const originalGet = axios.get; let detailCalls = 0; let omdbCalls = 0;
      const bundled = { id: 123, title: 'A Film', original_title: 'A Film', release_date: '2026-01-01', runtime: 111,
        overview: '', production_countries: [{ iso_3166_1: 'DE', name: 'Germany' }],
        credits: { crew: [{ job: 'Director', name: 'Director A' }, { job: 'Director', name: 'Director B' }], cast: [] },
        external_ids: { imdb_id: 'tt1234567' }, translations: { translations: [] } };
      try {
        (axios as any).get = async (url: string) => {
          if (url.includes('/search/movie')) return { data: { results: [{ id: 123, title: 'A Film', original_title: 'A Film', release_date: '2026-01-01' }] } };
          if (url.includes('/movie/123')) { detailCalls++; return { data: bundled }; }
          if (url.startsWith('https://www.omdbapi.com')) { omdbCalls++; return { data: { Response: 'True', imdbID: 'tt1234567', Type: 'movie', Title: 'A Film', Year: '2026',
            Director: 'Director B', Country: 'France', Plot: 'Verified exact-ID fallback plot', Runtime: '99 min', imdbRating: '7.2', imdbVotes: '1,234', Ratings: [] } }; }
          throw new Error('Unexpected fixture API request');
        };
        const apiStore = new PipelineStore(':memory:'); const api = new TmdbClient('test-only');
        const options = { network: true, geocoder: null, tmdb: api, omdbKey: 'test-only' };
        const enriched = await execute(apiStore, [batch('a', [raw('A Film', '2026', { director: 'Director B' })])], options);
        assert.equal(enriched.movies[0].plot, 'Verified exact-ID fallback plot', 'Use retained OMDb fields to fill an actual gap on the verified identity');
        assert.equal(enriched.movies[0].country, 'Germany', 'Keep the preferred nonempty TMDb value');
        assert.equal(enriched.movies[0].runtime, 111); assert.equal(detailCalls, 1, 'Identity verification and enrichment share the same TMDb response');
        assert.deepEqual(enriched.movies[0].directors, ['Director A', 'Director B'], 'A source naming a co-director can match the complete credited director list');
        const firstFetched = apiStore.resource('tmdb-detail:123')!.fetchedAt;
        await execute(apiStore, undefined, { ...options, now: '2026-10-15T10:10:00Z' });
        assert.equal(detailCalls, 1); assert.equal(omdbCalls, 1); assert.equal(apiStore.resource('tmdb-detail:123')!.fetchedAt, firstFetched);
        const unresolvedCache = new PipelineStore(':memory:');
        await execute(unresolvedCache, [batch('a', [raw('A Film', null, { director: null, cast: null })])], options);
        await execute(unresolvedCache, undefined, { ...options, now: '2026-10-15T10:10:00Z' });
        assert.equal(unresolvedCache.resource('tmdb-detail:123')!.fetchedAt, NOW, 'Reusing candidate evidence must not reset its fetch timestamp');
        assert.equal(unresolvedCache.resource('tmdb-enrichment:123'), null, 'Full candidate data never bypasses identity acceptance'); checks += 10;
        const cachedOmdb = structuredClone(apiStore.resource('omdb:tt1234567')!.data);
        cachedOmdb.metadata.year = 1985; cachedOmdb.metadata.releaseDate = '1985-03-18';
        apiStore.saveResource('omdb:tt1234567', cachedOmdb, NOW);
        const yearDifference = await execute(apiStore, undefined, { network: false, tmdb: null });
        assert.equal(yearDifference.movies[0].imdbRating, 7.2, 'Same verified IMDb ID and director allow ratings despite a release-year disagreement');
        assert.equal(yearDifference.movies[0].year, 2026);
        assert.equal(yearDifference.movies[0].releaseDate, '2026-01-01', 'A disputed OMDb date cannot replace the established date');
        assert.ok(apiStore.issues().some(issue => issue.details.resolutionCode === 'same-verified-id-different-year' && issue.status === 'caution'));
        assert.equal(yearDifference.review.open, 0, 'Cached provider evidence is reconciled offline without hiding a real conflict');
        cachedOmdb.metadata.director = 'Unrelated Director'; cachedOmdb.metadata.directors = ['Unrelated Director'];
        apiStore.saveResource('omdb:tt1234567', cachedOmdb, NOW);
        const directorDifference = await execute(apiStore, undefined, { network: false, tmdb: null });
        assert.equal(directorDifference.movies[0].imdbRating, null, 'Actual credit contradictions still withhold OMDb data, including historical fallback');
        assert.ok(apiStore.issues().some(issue => issue.status === 'open' && issue.subject === 'pipeline:omdb:tt1234567'));
        cachedOmdb.metadata.director = 'Director B'; cachedOmdb.metadata.directors = ['Director B']; cachedOmdb.imdbId = 'tt9999999';
        apiStore.saveResource('omdb:tt1234567', cachedOmdb, NOW);
        const wrongId = await execute(apiStore, undefined, { network: false, tmdb: null });
        assert.equal(wrongId.movies[0].imdbRating, null, 'A mismatched cached IMDb ID cannot use the release-year exception'); checks += 8;
        const originalCandidates = api.candidates.bind(api);
        api.candidates = async () => [];
        const absentStore = new PipelineStore(':memory:');
        const noResult = await execute(absentStore, [batch('a')], { ...options, omdbKey: undefined });
        assert.equal(noResult.movies[0].identityStatus, 'source-only');
        assert.equal(noResult.review.open, 0, 'A successful search with no candidate needs no identity decision');
        assert.ok(absentStore.issues().some(issue => issue.details.resolutionCode === 'metadata-unavailable-source-retained'));
        api.candidates = originalCandidates;
        const undatedStore = new PipelineStore(':memory:');
        const undatedMatch = await execute(undatedStore, [batch('a', [raw('A Film', null, { cast: null })])], options);
        assert.equal(undatedMatch.movies[0].identityStatus, 'verified', 'One full-title/director candidate can resolve an undated source');
        const yearStore = new PipelineStore(':memory:');
        bundled.release_date = '1927-01-01'; bundled.credits.cast = [{ name: 'Actor A' }, { name: 'Actor B' }] as any;
        api.candidates = async () => [{ id: 123, title: 'A Film', original_title: 'A Film', release_date: '1927-01-01', overview: '' }];
        const yearMatch = await execute(yearStore, [batch('a', [raw('A Film', '1925', { cast: ['Actor A', 'Actor B'] })])], { ...options, omdbKey: undefined });
        assert.equal(yearMatch.movies[0].identityStatus, 'verified', 'A year discrepancy can be resolved by complete title, director and two cast members');
        assert.equal(yearMatch.movies[0].year, 1927);
        assert.ok(yearStore.issues().some(issue => issue.details.resolutionCode === 'full-title-director-cast-year-difference' && issue.status === 'caution')); checks += 7;
      } finally { axios.get = originalGet; }
    }

    const live = currentSnapshot({ schemaVersion: 2, movies: initial.movies, scrapedAt: NOW } as any, new Date('2026-10-16T10:01:00Z'));
    assert.equal(live.movies.length, 0, 'A cached static dataset must enforce the 24-hour source expiry in the browser'); checks++;

    const published = new PipelineStore(':memory:'); published.acquireLease('publish');
    published.publish({ movies: [{ title: 'Keep me' }] }, 0, NOW); published.bumpRevision();
    assert.throws(() => published.publish({ movies: [] }, 0, NOW)); assert.equal(published.snapshot().movies[0].title, 'Keep me'); checks += 2;
    const publicRoot = path.join(directory, 'publication'); fs.mkdirSync(path.join(publicRoot, 'public'), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, 'public/movies.json'), 'previous public data');
    assert.throws(() => publishWithRollback(published, { movies: [], scrapedAt: NOW }, 1, () => { throw new Error('Audit failure'); }, publicRoot));
    assert.equal(fs.readFileSync(path.join(publicRoot, 'public/movies.json'), 'utf8'), 'previous public data');
    assert.equal(published.snapshot().movies[0].title, 'Keep me'); checks += 3;
    fs.unlinkSync(path.join(publicRoot, 'public/movies.json')); fs.rmdirSync(path.join(publicRoot, 'public')); fs.rmdirSync(publicRoot);

    const httpStore = new PipelineStore(':memory:');
    httpStore.saveEntity({ id: 'http-film', kind: 'film', name: 'A Film', data: {} });
    const httpIssue = flag(httpStore, 'metadata-match', 'metadata:http-film', 'Resolve metadata: A Film', { entityId: 'http-film', candidates: [], listing: { title: 'A Film' } });
    const server = createAdminServer(httpStore, { rebuild: async () => ({ total: 0, scrapedAt: NOW }) });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as any).port; const base = `http://127.0.0.1:${port}`;
      assert.equal((await fetch(`${base}/api/review/state`)).status, 200);
      assert.equal((await fetch(`${base}/api/review/issue?id=missing`)).status, 404);
      const dossier = await (await fetch(`${base}/api/review/issue?id=${httpIssue.id}`)).json() as any;
      assert.ok(dossier.reasons, JSON.stringify(dossier));
      assert.ok(dossier.reasons.some((reason: any) => reason.code === 'missing-data'));
      assert.ok((await (await fetch(`${base}/sw.js`)).text()).includes('unregister'));
      assert.equal((await (await fetch(`${base}/admin/review`)).text()).includes('src="/registerSW.js"'), false, 'Local review must not register a PWA that serves an obsolete editor');
      const previousGet = axios.get; const previousKey = process.env.TMDB_API_KEY; let lookups = 0;
      try {
        process.env.TMDB_API_KEY = 'test-only';
        (axios as any).get = async () => { lookups++; return { data: { id: 789, title: 'Custom film', original_title: 'Custom film',
          release_date: '2026-01-01', credits: { crew: [{ job: 'Director', name: 'Custom director' }] }, external_ids: {} } }; };
        const addCandidate = (tmdbId: string, revision = httpStore.revision) => fetch(`${base}/api/review/metadata-candidate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
          body: JSON.stringify({ issueId: httpIssue.id, evidenceFingerprint: httpIssue.fingerprint, revision, tmdbId }),
        });
        assert.equal((await addCandidate('789', -1)).status, 409); assert.equal(lookups, 0, 'Stale custom lookups cannot spend a request or modify evidence');
        assert.equal((await addCandidate('https://example.test/movie/789')).status, 400);
        const added = await (await addCandidate('https://www.themoviedb.org/movie/789-custom-film?language=en-US')).json() as any;
        assert.equal(added.candidate.id, 789); assert.equal(lookups, 1);
        assert.equal(httpStore.entity('http-film')!.data.tmdbId, undefined, 'Looking up a custom film is not accepting its identity');
        assert.ok(previewReview(httpStore, { issueId: httpIssue.id, action: 'metadata', revision: httpStore.revision,
          evidenceFingerprint: httpIssue.fingerprint, values: { tmdbId: 789 }, reason: 'Manual comparison' }).patch);
        checks += 11;
      } finally { axios.get = previousGet; if (previousKey === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = previousKey; }
      assert.equal((await fetch(`${base}/api/review/recalculate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' })).status, 403);
      assert.equal((await fetch(`${base}/api/review/recalculate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' })).status, 202);
      checks += 3;
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    console.log(`Pipeline tests passed (${checks} scenario checks plus invariant assertions).`);
  } finally {
    for (const filename of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, filename)); fs.rmdirSync(directory);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
