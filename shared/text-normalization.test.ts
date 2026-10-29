import assert from 'assert/strict';
import { normalizeComparisonText as key } from './text-normalization';
import { normalizePersonComparison as person } from './text-normalization';

for (const [source, transcription] of [
  ['Çatlı 2', 'Catli 2'], ['ÇATLI 2', 'catli 2'], ['İstanbul', 'Istanbul'],
  ['Łódź', 'Lodz'], ['Smørrebrød', 'Smorrebrod'], ['Đorđe', 'Dorde'],
  ['Guðrún', 'Gudrun'], ['Þór', 'Thor'], ['Æon Flux', 'Aeon Flux'],
  ['Cœur', 'Coeur'], ['Straße', 'Strasse'], ['STRAẞE', 'strasse'],
  ['François', 'Francois'], ['Dvořák', 'Dvorak'], ['São Paulo', 'Sao Paulo'],
  ['Ħal', 'Hal'], ['Ŧana', 'Tana'], ['Ŋala', 'Ngala'],
  ['ＣＡＴＬＩ ２', 'catli 2'], ['“L’ÉTÉ”—2026', 'l ete 2026'],
] as const) assert.equal(key(source), key(transcription), `${source} / ${transcription}`);

for (const [a, b] of [
  ['Catli 2', 'Catli 3'], ['Catli 2', 'Catli'], ['Alien', 'Aliens'],
  ['東京', '京都'], ['мир', 'мір'], ['حَلّ', 'حل'], ['a', 'а'], ['Stalker', 'Сталкер'],
] as const) assert.notEqual(key(a), key(b), `Distinct titles/scripts must remain distinct: ${a} / ${b}`);

for (const text of ['Çatlı 2', '東京', 'Сталкер', 'حَلّ', 'L’ÉTÉ']) {
  assert.ok(key(text).length > 0);
  assert.equal(key(key(text)), key(text), 'Comparison keys are idempotent');
  assert.equal(key(text), key(text.normalize('NFD')), 'Canonical Unicode forms compare equally');
}
console.log('shared text-normalization rules passed');
for (const [a, b] of [['Sanggeun Park', 'Park Sang-geun'], ['Jineui Kim', 'Kim Jin-eui'],
  ['Jean-Luc Godard', 'Godard Jeanluc'], ['Brydie O’Connor', 'Brydie OConnor']]) assert.equal(person(a), person(b));
assert.notEqual(person('Ken Russell'), person('Ken Loach'));
assert.notEqual(person('Sanggeun Park'), person('Sangwoo Park'));
