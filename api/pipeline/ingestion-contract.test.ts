import assert from 'assert/strict';
import { runPipeline } from './pipeline';
import { PipelineStore } from './store';
import * as observations from './observations';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { publishWithRollback } from './pipeline';

const NOW = '2026-10-15T10:00:00Z';
const movie = (title = 'A Film'): any => ({ title, rawTitle: title, sourceId: 'film-1',
  url: 'https://example.test/film/1', variants: ['OV'],
  cinemas: [{ name: 'Example Cinema', address: 'Example Street 1, 10115 Berlin' }],
  showings: [{ cinema: 'Example Cinema', date: '2026-10-16', time: '20:00', url: 'https://example.test/cinema/1' }] });
const batch = (movies: any[]): any => ({ source: 'critic.de', observedAt: NOW, status: 'fresh', complete: true, movies });
const execute = (store: PipelineStore, input: any) => runPipeline({ store, now: NOW, network: false, model: null, tmdb: null,
  osm: [{ id: 'node/1', name: 'Example Cinema', address: 'Example Street 1', insideBerlin: true }],
  publish: false, audit: false, ...input });

async function main() {
  const baseline = await execute(new PipelineStore(':memory:'), { batches: [batch([movie()])] });
  const store = new PipelineStore(':memory:');
  const result = await execute(store, { batches: [batch([null, { title: 42 }, { ...movie(), director: { broken: true }, cast: 42 }])] });
  assert.equal(result.movies.length, 1, 'Malformed siblings and optional metadata must leave a usable showing');
  assert.equal(result.movies[0].id, baseline.movies[0].id);
  assert.equal(result.movies[0].slug, baseline.movies[0].slug);
  assert.equal(result.movies[0].director, null);
  assert.ok(result.ingestion[0].diagnostics.some((diagnostic: any) => diagnostic.code === 'invalid-record'));
  assert.ok(result.ingestion[0].diagnostics.some((diagnostic: any) => diagnostic.code === 'invalid-field'));
  assert.equal(result.ingestion[0].safeForWithdrawal, false);

  const other = { ...movie('Another Film'), sourceId: 'film-2' };
  other.cinemas = [{ name: 'Example Cinema' }];
  const sharedVenue = await execute(new PipelineStore(':memory:'), { batches: [batch([other, movie()])] });
  assert.equal(sharedVenue.movies.length, 2, 'Repeated legacy venue subjects keep the established last-row behavior');

  const translate = (observations as any).translateLegacyBatch;
  const legacy = batch([movie()]);
  const collection = translate(legacy);
  collection.records.find((record: any) => record.kind === 'listing').fields.director =
    { state: 'failed', reason: 'Detail page unavailable', retryable: true };
  collection.records.find((record: any) => record.kind === 'listing').fields.posterUrl =
    { state: 'absent', reason: 'Provider explicitly reports no poster' };
  for (const record of collection.records) record.provenance.upstreamLineage = ['shared-feed'];
  const typedStore = new PipelineStore(':memory:');
  const typed = await execute(typedStore, { collections: [collection] });
  assert.equal(typed.movies[0].id, baseline.movies[0].id);
  assert.equal(typed.movies[0].slug, baseline.movies[0].slug);
  const listing = typedStore.observations().find(record => record.kind === 'listing')!;
  assert.equal((listing as any).fields.director.state, 'failed');
  assert.equal((listing as any).fields.posterUrl.state, 'absent');
  assert.equal((listing as any).fields.year.state, 'unknown', 'Missing legacy fields must remain unknown');
  assert.deepEqual(typed.movies[0].sourceAliases[0].provenance.upstreamLineage, ['shared-feed']);
  assert.equal(typed.movies[0].sourceAliases[0].provenance.observedAt, NOW);
  assert.equal(typed.movies[0].sourceAliases[0].provenance.recordId, listing.sourceKey);

  const badOptional = structuredClone(collection);
  badOptional.records.find((record: any) => record.kind === 'listing').fields.director = { state: 'known', value: { invalid: true } };
  const optional = await execute(new PipelineStore(':memory:'), { collections: [badOptional] });
  assert.equal(optional.movies.length, 1, 'Invalid typed optional fields cannot discard the listing');
  assert.ok(optional.ingestion[0].diagnostics.some((diagnostic: any) => diagnostic.code === 'invalid-field'));

  const withDetails = movie();
  withDetails.url = 'https://www.critic.de/ov-movies-berlin/movie/a-film-123/';
  withDetails.sourceDetails = { url: withDetails.url, fetchedAt: '2026-10-15T09:00:00Z', parserVersion: 5,
    creditsChecked: true, fields: { director: 'Retained Director' } };
  const detailed = await execute(new PipelineStore(':memory:'), { batches: [batch([withDetails])] });
  assert.equal(detailed.movies[0].director, 'Retained Director');
  assert.equal(detailed.movies[0].sourceAliases[0].provenance.observedAt, NOW, 'Detail refresh preserves listing provenance');
  const malformedDetail = structuredClone(withDetails);
  malformedDetail.sourceDetails.fields.director = { broken: true };
  const isolatedDetail = await execute(new PipelineStore(':memory:'), { batches: [batch([malformedDetail])] });
  assert.equal(isolatedDetail.movies.length, 1, 'Malformed retained optional detail fields cannot crash a source-backed listing');
  assert.equal(isolatedDetail.movies[0].director, null);
  assert.ok(isolatedDetail.ingestion[0].diagnostics.some((diagnostic: any) => diagnostic.code === 'invalid-field'));

  const retained = new PipelineStore(':memory:');
  for (const old of observations.adaptBatch(legacy)) retained.observe(old);
  const expanded = await execute(retained, { batches: [legacy] });
  assert.equal(expanded.movies[0].sourceAliases[0].provenance.observedAt, NOW,
    'Replaying retained legacy observations must add attribution without regenerating their IDs');
  const later = '2026-10-15T11:00:00Z';
  const refreshed = await execute(retained, { batches: [{ ...legacy, observedAt: later }], now: later });
  assert.equal(refreshed.movies[0].sourceAliases[0].provenance.observedAt, later,
    'A fresh reobservation must attribute its actual observation time');
  assert.equal(refreshed.movies[0].id, expanded.movies[0].id);

  const invalid = await execute(typedStore, { collections: [{ ...collection, records: null }] });
  assert.equal(invalid.ingestion[0].status, 'rejected-source');
  assert.equal(invalid.movies[0].id, typed.movies[0].id, 'Rejected envelopes retain eligible previous evidence');
  assert.equal(invalid.ingestion[0].safeForWithdrawal, false);
  const broken = structuredClone(collection);
  broken.records.find((record: any) => record.kind === 'screening').data.venueRecordId = 'missing-venue';
  const partial = await execute(typedStore, { collections: [broken] });
  assert.equal(partial.movies[0].id, typed.movies[0].id, 'Broken references cannot withdraw retained showings');
  assert.equal(partial.ingestion[0].safeForWithdrawal, false);
  assert.equal(partial.ingestion[0].coverage[0].status, 'partial');
  assert.ok(partial.ingestion[0].diagnostics.some((diagnostic: any) => diagnostic.code === 'broken-reference'));

  for (const source of ['critic.de', 'berlin.de']) {
    const validRaw = { ...movie(), director: null, cast: null, year: '2026', country: null,
      sourceDetails: { url: 'https://example.test/film/1', fetchedAt: '2026-10-14T10:00:00Z', fields: {}, failed: true } };
    const legacyBatch = { ...batch([validRaw]), source };
    const continuity = new PipelineStore(':memory:');
    const original = await execute(continuity, { batches: [legacyBatch] });
    continuity.addOverride({ subject: `entity:${original.movies[0].id}`, action: 'patch', patch: { fields: { plot: 'Reviewed plot' } },
      reason: 'Human correction', actor: 'fixture', evidenceFingerprint: 'fixture' });
    const replay = await execute(continuity, { collections: [translate(legacyBatch)] });
    assert.equal(replay.movies[0].plot, 'Reviewed plot');
    assert.equal(replay.movies[0].id, original.movies[0].id);
    assert.equal(replay.movies[0].slug, original.movies[0].slug);
    assert.deepEqual(replay.movies[0].showings, original.movies[0].showings);
    assert.deepEqual(continuity.observations().map(record => record.id).sort(), observations.adaptBatch(legacyBatch).map(record => record.id).sort(),
      'Translation must retain observation identity/fingerprints, including legacy null fields');
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-contract-publication-'));
  try {
    const publication = new PipelineStore(':memory:');
    assert.throws(() => publishWithRollback(publication, { schemaVersion: 99, movies: [], scrapedAt: NOW }, 0, () => {}, root), /Invalid public snapshot/);
    assert.equal(publication.snapshot(), null, 'A malformed publication cannot enter durable snapshots');
    assert.equal(fs.existsSync(path.join(root, 'public/movies.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  console.log('ingestion contract acceptance tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
