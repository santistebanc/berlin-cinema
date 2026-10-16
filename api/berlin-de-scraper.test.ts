import assert from 'assert/strict';
import BerlinDeScraper from './berlin-de-scraper';

async function main() {
  const scraper = new BerlinDeScraper();
  let pages = 0;
  const html = `<ul class="js-accordion"><li>
    <span class="js-accordion__trigger"><span class="info">A Film</span></span>
    <div class="js-accordion__panel"><p>A Film läuft im "Odeon"</p>
    <a href="/kino/_bin/filmdetail.php/123">Film</a><table><tbody>
    <tr><td>Fr, 16.10.26</td><td>9:00 (OV), 09:00 (OV), 09:00 (OmU), 25:70 (OV)</td></tr>
    <tr><td>Mo, 31.02.26</td><td>20:00 (OV)</td></tr>
    </tbody></table></div></li></ul>`;
  (scraper as any).fetchWithRetry = async () => { pages++; return html; };
  const movies = await scraper.scrapeRawMovies();
  assert.equal(pages, 2, 'Repeated pagination must stop after no new viewings');
  assert.equal(movies.length, 1);
  assert.equal(movies[0].showings.length, 2, 'Remove repeats and invalid dates/times while preserving distinct formats');
  assert.deepEqual(movies[0].showings.map(showing => showing.time), ['09:00', '09:00']);
  console.log('berlin-de-scraper tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
