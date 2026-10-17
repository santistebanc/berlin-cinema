import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { syncData } from './sync-data';

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'berlin-cinema-sync-'));
  const output = path.join(directory, 'movies.json');
  const valid = {
    movies: [{ title: 'Test Film', slug: 'test-film', showings: {}, cinemas: [], plot: 'A plot.' }],
    total: 1, scrapedAt: '2026-10-15T08:00:00Z',
  };
  let payload: any = valid;
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}/movies.json`;
    await syncData(url, output);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf-8')), valid);
    for (const invalid of [{ movies: [] }, { ...valid, movies: [null] }, { ...valid, scrapedAt: 'invalid' }]) {
      payload = invalid;
      await assert.rejects(syncData(url, output), /invalid/);
      assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf-8')), valid,
        'A bad response must never replace usable local movie data');
    }
    payload = { schemaVersion: 2, movies: [], total: 0, scrapedAt: valid.scrapedAt, programmeStatus: 'empty' };
    await syncData(url, output);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), payload, 'Static sync accepts a validated empty programme');
    const empty = payload;
    payload = { ...empty, schemaVersion: 99 };
    await assert.rejects(syncData(url, output), /invalid/i);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), empty);
    assert.deepEqual(fs.readdirSync(directory), ['movies.json'], 'No partial downloads should remain');
    console.log('sync-data tests passed');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (fs.existsSync(output)) fs.unlinkSync(output);
    fs.rmdirSync(directory);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
