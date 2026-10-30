import assert from 'assert/strict';
import { filmSearchTitles, filmTitleKeys } from './film-title-search';
import { programmeRule } from '../src/utils/screeningLabels';

assert.deepEqual(filmSearchTitles(['Mein neues altes Ich - Eine Reise in das Mysterium der Menopause']),
  ['Mein neues altes Ich - Eine Reise in das Mysterium der Menopause', 'Mein neues altes Ich']);
assert.deepEqual(filmSearchTitles(['Exhibition On Screen: Frida Kahlo Encore 2026']),
  ['Exhibition On Screen: Frida Kahlo Encore 2026', 'Exhibition On Screen: Frida Kahlo']);
assert.deepEqual(filmSearchTitles(['Band in Tokyo: Live Viewing']), ['Band in Tokyo: Live Viewing', 'Band in Tokyo']);
for (const title of ['Kaidan - Ikite iru Koheiji', 'Blade Runner - Final Cut', 'Part One - Return 2026',
  'GUTS - A female Expedition through Africa + Her Wave', 'Double Feature: Suspiria + Demons']) {
  assert.deepEqual(filmSearchTitles([title]), [title], `Preserve work and edition qualifiers: ${title}`);
}
assert.ok(filmTitleKeys('The Texas Chainsaw Massacre').includes('texas chainsaw massacre'));
assert.deepEqual(filmTitleKeys('Band in Tokyo: Live Viewing'), filmTitleKeys('Band in Tokyo'));
assert.notDeepEqual(filmTitleKeys('Halloween II'), filmTitleKeys('Halloween'));
assert.notDeepEqual(filmTitleKeys('Tour in Tokyo'), filmTitleKeys('Tour in Osaka'));
assert.equal(programmeRule('Double Feature: Suspiria + Demons'), 'double-feature');
assert.equal(programmeRule('Halloween Double Feature'), 'double-feature');
assert.equal(programmeRule('Portuguese Cinema Days Berlin 2026'), 'named-film-festival');
assert.equal(programmeRule('Double Indemnity'), null);
assert.equal(programmeRule('Hobbs + Shaw'), null);
console.log('film title query tests passed');
