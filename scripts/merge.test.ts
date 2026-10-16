import assert from 'assert/strict';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';

async function main() {
  const store = new PipelineStore(':memory:');
  const raw = { title: 'Cached Film', rawTitle: 'Cached Film', year: '2026', director: 'A Director',
    url: 'https://www.critic.de/movie/cached-film/', variants: ['OV'],
    cinemas: [{ name: 'Odeon', address: 'Hauptstraße 116, 10827 Berlin' }],
    showings: [{ date: '2026-10-16', time: '20:00', cinema: 'Odeon' }] };
  const legacy = { scrapedAt: '2026-10-15T09:00:00Z', movies: [{ ...raw, slug: 'cached-film', year: 2026,
    tmdbFetched: true, plot: 'Previously guessed plot', imdbId: 'tt1234567' }] };
  const result = await runPipeline({ store, legacy, now: '2026-10-15T10:00:00Z', network: false, model: null, tmdb: null, osm: [], publish: false,
    batches: [{ source: 'critic.de', observedAt: '2026-10-15T10:00:00Z', status: 'fresh', complete: true, movies: [raw] }] });
  assert.equal(result.movies[0].slug, 'cached-film', 'Compatible source identity may retain its public URL');
  assert.equal(result.movies[0].plot, null, 'Legacy inferred metadata must not become verified evidence');
  assert.equal(result.movies[0].imdbId, null);
  assert.ok(result.movies[0].showings['2026-10-16']['20:00']);
  assert.ok(store.resource('legacy-import'), 'Original enrichment is preserved for inspection/migration');
  assert.ok(store.issues().some(issue => issue.type === 'legacy-evidence'));
  console.log('merge migration tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
