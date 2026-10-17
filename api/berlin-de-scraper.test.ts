import assert from 'assert/strict';
import { SourceRegistry } from './sources/registry';
import { berlinAdapter } from './sources/berlin';
import { defaultInstances } from './sources/defaults';
import type { SourceDependencies } from './sources/types';

async function main() {
  let pages = 0;
  const html = `<ul class="js-accordion"><li>
    <span class="js-accordion__trigger"><span class="info">A Film</span></span>
    <div class="js-accordion__panel"><p>A Film läuft im "Odeon"</p>
    <a href="/kino/_bin/filmdetail.php/123">Film</a><table><tbody>
    <tr><td>Fr, 16.10.26</td><td>9:00 (OV), 09:00 (OV), 09:00 (OmU), 25:70 (OV)</td></tr>
    <tr><td>Mo, 31.02.26</td><td>20:00 (OV)</td></tr>
    </tbody></table></div></li></ul>`;
  const registry = new SourceRegistry([berlinAdapter], defaultInstances.filter(instance => instance.id === 'berlin.de')
    .map(instance => ({ ...instance, limits: { ...instance.limits, filmDetails: 0, venueDetails: 0 } })));
  const deps: SourceDependencies = { now: () => '2026-10-15T10:00:00Z', network: true, diagnostic: () => {},
    cache: { get: () => undefined, set: () => {} }, request: async () => { pages++; return { body: html, status: 200, headers: {} }; } };
  const [collection] = await registry.collect(deps);
  assert.equal(collection.status, 'fresh');
  assert.equal(pages, 2, 'Repeated pagination must stop after no new viewings');
  assert.equal(collection.records.filter(record => record.kind === 'listing').length, 1);
  const screenings = collection.records.filter(record => record.kind === 'screening');
  assert.equal(screenings.length, 2, 'Remove repeats and invalid dates/times while preserving distinct formats');
  assert.deepEqual(screenings.map(record => record.data.time), ['09:00', '09:00']);
  console.log('berlin-de-scraper tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
