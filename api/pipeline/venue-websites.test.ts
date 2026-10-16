import assert from 'assert/strict';
import axios from 'axios';
import { PipelineStore } from './store';
import { adaptBatch, observation } from './observations';
import { fillVenueDetails, parseVenueDetails } from './source-venues';
import { attachVenueWebsites } from './venue-websites';

async function main() {
  const url = 'https://www.critic.de/ov-movies-berlin/cinema/example/';
  const address = 'Example Straße 1, 10115 Berlin';
  const now = new Date().toISOString();
  const html = `<div id="kino_infos"><address><a class="mob-adr-lnk">${address}</a></address>
    <a class="external-link" href="https://cinema.example/programme">Website of Example Cinema</a></div>
    <footer><a href="https://advertiser.example">Website of Advertiser</a></footer>`;
  const fields = parseVenueDetails(html, url)!;
  assert.equal(fields.websiteUrl, 'https://cinema.example/programme');
  assert.equal(fields.websiteName, 'Example Cinema');
  assert.equal(parseVenueDetails(html.replace('https://cinema.example/programme', 'javascript:alert(1)'), url)?.websiteUrl, undefined);
  assert.equal(parseVenueDetails('<footer><a href="https://advertiser.example">Website of Cinema</a></footer>', url), null);

  const store = new PipelineStore(':memory:'); let requests = 0;
  const originalGet = axios.get;
  try {
    (axios as any).get = async () => { requests++; return { status: 200, data: html }; };
    const row: any = { cinemas: [{ name: 'Example Cinema', address, url }] };
    await fillVenueDetails([row], store, 1);
    assert.equal(requests, 1, 'A known address must not skip missing website extraction');
    assert.equal(row.cinemas[0].websiteUrl, fields.websiteUrl);
    await fillVenueDetails([{ cinemas: [{ name: 'Example Cinema', address, url }] }], store, 1);
    assert.equal(requests, 1, 'Reuse the detail-page cache');
    const adapted = adaptBatch({ source: 'critic.de', movies: [{ title: 'Example Film', ...row }], observedAt: now, status: 'fresh', complete: true });
    const source = adapted.find(item => item.kind === 'venue')!;
    assert.equal(source.data.websiteUrl, fields.websiteUrl);
    const venue = { id: 'cinema-1', kind: 'venue' as const, name: 'Example Cinema', data: { address, insideBerlin: true } };
    store.saveEntity(venue);
    const linked = new Map([[source.subject, venue]]);
    assert.equal(attachVenueWebsites(store, linked, [source]).get(source.subject)!.data.websiteUrl, fields.websiteUrl,
      'An established source identity can receive its website without resolving or merging again');

    const changed = observation('critic.de', 'venue', 'different-address', { ...source.data,
      websiteEvidence: { ...source.data.websiteEvidence, address: 'Example Straße 2, 10115 Berlin' } }, now);
    assert.equal(attachVenueWebsites(store, new Map([[changed.subject, venue]]), [changed]).get(changed.subject)!.data.websiteUrl, undefined,
      'A neighboring cinema or branch cannot supply a website');
    const otherName = observation('critic.de', 'venue', 'different-name', { ...source.data,
      websiteEvidence: { ...source.data.websiteEvidence, name: 'Example Cinema Next Door' } }, now);
    assert.equal(attachVenueWebsites(store, new Map([[otherName.subject, venue]]), [otherName]).get(otherName.subject)!.data.websiteUrl, undefined,
      'A title substring is insufficient even at the same address');
    const correctedVenue = { ...venue, data: { ...venue.data, address: 'Example Straße 1, 10117 Berlin',
      locationEvidence: { identityEstablished: true, sourceAddress: address } } };
    assert.equal(attachVenueWebsites(store, new Map([[source.subject, correctedVenue]]), [source]).get(source.subject)!.data.websiteUrl,
      fields.websiteUrl, 'A verified cinema identity retains website evidence when the provider corrected its source address');
    const conflict = observation('critic.de', 'venue', 'conflicting-website', { ...source.data, websiteUrl: 'https://different.example/' }, now);
    assert.equal(attachVenueWebsites(store, new Map([[source.subject, venue], [conflict.subject, venue]]), [source, conflict])
      .get(source.subject)!.data.websiteUrl, undefined, 'Conflicting source links are not guessed');
    const poi = { id: 'node/1', name: venue.name, address, insideBerlin: true, website: 'https://poi.example/' };
    assert.equal(attachVenueWebsites(store, linked, [], [poi]).get(source.subject)!.data.websiteUrl, poi.website,
      'Already resolved cinemas can receive an exact name/address website from OSM');
    assert.equal(attachVenueWebsites(store, linked, [], [{ ...poi, name: 'Example Cinema Next Door' }])
      .get(source.subject)!.data.websiteUrl, undefined, 'An OSM name substring is insufficient');
    store.addOverride({ subject: `entity:${venue.id}`, action: 'patch', patch: { fields: { websiteUrl: null } },
      actor: 'test', reason: 'Explicitly remove website', evidenceFingerprint: 'test' });
    assert.equal(attachVenueWebsites(store, linked, [source]).get(source.subject)!.data.websiteUrl, undefined,
      'Manual website clearing must be preserved');
  } finally { axios.get = originalGet; }
  console.log('cinema website extraction, caching and identity tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
