import assert from 'assert/strict';
import https from 'https';
import { EventEmitter } from 'events';
import { fetchBerlinAddresses, fetchBerlinCinemas } from './osm-client';
import { osmStreetPattern, venueAddressesMatch } from './pipeline/addresses';

async function main() {
  const originalGet = https.get;
  const originalTimeout = global.setTimeout;
  let mode: 'hang' | 'http-error' | 'success' = 'hang';
  let destroyed = false;
  let lastUrl = '';
  let elements: any[] = [{ tags: { name: 'Odeon', website: 'https://www.yorck.de/', alt_name: 'Odeon Kino;Odeon Filmtheater',
    wheelchair: 'yes', opening_hours: 'Mo-Su 12:00-23:00', 'contact:phone': '+49 30 1234' } }];
  try {
    // Exercise the real request deadline without waiting 30 seconds.
    (global as any).setTimeout = (fn: any, delay: number, ...args: any[]) =>
      originalTimeout(fn, delay === 30000 ? 5 : delay, ...args);
    (https as any).get = (_url: any, _options: any, callback: any) => {
      lastUrl = String(_url);
      const request: any = new EventEmitter();
      request.destroy = (error?: Error) => { destroyed = true; if (error) request.emit('error', error); };
      if (mode !== 'hang') queueMicrotask(() => {
        const response: any = new EventEmitter();
        response.statusCode = mode === 'http-error' ? 503 : 200;
        response.resume = () => {};
        callback(response);
        response.emit('data', JSON.stringify({ elements }));
        response.emit('end');
      });
      return request;
    };
    const timeoutResult = await Promise.race([
      fetchBerlinCinemas().then(() => 'resolved', error => String(error.message)),
      new Promise<string>(resolve => originalTimeout(() => resolve('hung'), 100)),
    ]);
    assert.match(timeoutResult, /timed out/i, 'An unresponsive OSM service must not hang the refresh');
    assert.ok(destroyed, 'Timeout must close the request');
    mode = 'http-error';
    await assert.rejects(fetchBerlinCinemas(), /503/, 'HTTP errors must not be cached as cinema data');
    mode = 'success';
    const cinemas = await fetchBerlinCinemas();
    assert.equal(cinemas[0].website, 'https://www.yorck.de/');
    assert.deepEqual(cinemas[0].aliases, ['Odeon Kino', 'Odeon Filmtheater']);
    assert.equal(cinemas[0].phone, '+49 30 1234'); assert.equal(cinemas[0].wheelchair, 'yes');
    assert.equal(cinemas[0].tags!.opening_hours, 'Mo-Su 12:00-23:00');
    elements = [{ type: 'way', id: 123, tags: { 'addr:street': 'Rosenthaler Straße', 'addr:housenumber': '40/41', 'addr:postcode': '10178' }, center: { lat: 52.52, lon: 13.4 } }];
    const address = 'Rosenthaler Str. 40-41, 10178 Berlin';
    const addresses = await fetchBerlinAddresses([osmStreetPattern(address)!]);
    assert.equal(addresses[0].id, 'way/123');
    assert.equal(venueAddressesMatch(address, addresses[0].address!), true);
    assert.equal(addresses[0].latitude, 52.52);
    assert.equal(addresses[0].postalCode, '10178'); assert.equal(addresses[0].houseNumber, '40/41');
    const query = new URL(lastUrl).searchParams.get('data')!;
    assert.ok(query.includes('nwr[') && query.includes('(area.b)') && query.includes('strasse'), 'Query address nodes, ways and relations inside Berlin with street spelling variants');
    assert.deepEqual(await fetchBerlinAddresses([]), []);
    console.log('osm-client tests passed');
  } finally {
    https.get = originalGet;
    global.setTimeout = originalTimeout;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
