import assert from 'assert/strict';
import { parseBerlinFilmMetadata, parseFilmMetadata } from './film-metadata';

const html = `<h1>Ghostbusters</h1><p>The three scientists become ghost hunters.</p>
  <div class="block article-attributes"><h2 class="title">Filmdaten</h2><dl>
  <dt>Darsteller:</dt><dd>Bill Murray</dd><dt>Länge:</dt><dd>105 min</dd><dt>Land:</dt><dd>USA</dd>
  <dt>Jahr:</dt><dd>1984</dd><dt>Genre:</dt><dd>Fantasykomödie</dd><dt>FSK:</dt><dd>12</dd>
  <dt>Filmstart:</dt><dd>05.11.26</dd><dt>Filmwebsite:</dt><dd><a href="https://example.com/film">Film</a></dd>
  </dl></div><div><p>Screening timetable, not a synopsis.</p></div>`;
assert.deepEqual(parseBerlinFilmMetadata(html), { cast: ['Bill Murray'], runtime: 105, country: 'USA', year: 1984,
  plot: 'The three scientists become ghost hunters.', genres: ['Fantasykomödie'], ageRating: '12',
  germanReleaseDate: '2026-11-05', homepage: 'https://example.com/film' });
assert.equal(parseFilmMetadata(html).plot, undefined, 'Berlin-specific extraction does not change other adapters');
assert.equal(parseBerlinFilmMetadata(html.replace('05.11.26', '31.02.26')).germanReleaseDate, undefined);
assert.equal(parseBerlinFilmMetadata(html.replace('https://example.com/film', 'javascript:alert(1)')).homepage, undefined);
assert.equal(parseBerlinFilmMetadata('<h1>Halloween II</h1><div class="article-attributes"><h2>Filmdaten</h2><dl><dt>FSK:</dt><dd>18</dd></dl></div><p>Screenings</p>').plot,
  undefined, 'Sparse pages do not acquire a timetable synopsis');
console.log('film-metadata tests passed');
