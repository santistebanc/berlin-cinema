import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PipelineStore } from '../api/pipeline/store';
import { runPipeline } from '../api/pipeline/pipeline';
import { ReviewConflict, applyReview, previewReview, fieldEvidence } from '../api/pipeline/review';
import { reviewEvidence } from '../api/pipeline/review-evidence';
import TmdbClient, { tmdbCandidate } from '../api/tmdb-client';
import { configuredModel } from '../api/pipeline/decision-model';
import { sanitizeAudit } from '../api/audit-log';

const ROOT = path.join(__dirname, '..');
export function createAdminServer(store: PipelineStore, options: { port?: number; root?: string; rebuild?: () => Promise<any> } = {}) {
  const root = options.root ?? ROOT;
  let queue = Promise.resolve();
  const mutate = <T>(callback: () => T): T => {
    const owner = randomUUID();
    if (!store.acquireLease(owner)) throw new ReviewConflict('Another writer is running. Retry after processing completes.');
    try { return callback(); } finally { store.releaseLease(owner); }
  };
  const schedule = (jobId: string) => {
    queue = queue.then(async () => {
      try {
        mutate(() => store.transaction(() => store.updateJob(jobId, 'processing', { kind: 'recalculate' })));
        const result = await (options.rebuild ? options.rebuild() : runPipeline({ store }));
        mutate(() => store.transaction(() => store.updateJob(jobId, 'published', { total: result.total, publishedAt: result.scrapedAt })));
      } catch (error) {
        try { mutate(() => store.transaction(() => store.updateJob(jobId, 'failed', { message: safeMessage(error) }))); }
        catch { /* Saved corrections survive even if a second writer currently owns the store. */ }
      }
    });
    return jobId;
  };
  const enqueue = () => schedule(mutate(() => store.transaction(() => store.createJob('recalculate'))));
  const server = http.createServer(async (request, response) => {
    const address = server.address(); const port = typeof address === 'object' && address ? address.port : options.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(request.headers.host ?? '')) return json(response, 403, { error: 'Local host required' });
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const api = url.pathname.startsWith('/api/');
    try {
      if (api) {
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'GET') {
          if (request.method !== 'POST' || request.headers.origin !== `http://${request.headers.host}`
            || !request.headers['content-type']?.startsWith('application/json')) return json(response, 403, { error: 'Local JSON request required' });
        }
        store.refresh();
        if (request.method === 'GET' && url.pathname === '/api/review/state') {
          const model = configuredModel();
          return json(response, 200, { revision: store.revision, issues: store.issues(), corrections: store.allOverrides(),
            jobs: store.jobs(), runs: store.runs(), snapshot: store.snapshotInfo(),
            model: model ? { provider: model.provider, model: model.model, inputUsdPerMillion: model.inputUsdPerMillion } : null,
            spendUsd: store.spend(), limitUsd: Number(process.env.DECISION_MONTHLY_USD_LIMIT || 8),
            threshold: Number(process.env.DECISION_THRESHOLD || 0.97),
            geocoding: { provider: 'Geoapify', configured: !!process.env.GEOAPIFY_API_KEY,
              creditsReserved: store.resource(`geoapify:usage:${new Date().toISOString().slice(0, 10)}`)?.data.creditsReserved ?? 0,
              dailyLimit: Number(process.env.GEOAPIFY_DAILY_CREDIT_LIMIT || 1000) } });
        }
        if (request.method === 'GET' && url.pathname === '/api/review/entities') {
          const term = (url.searchParams.get('q') || '').toLowerCase();
          return json(response, 200, store.entities(url.searchParams.get('kind') || undefined)
            .filter(e => !e.data.redirectTo && (e.name.toLowerCase().includes(term) || e.id.includes(term))).slice(0, 100));
        }
        if (request.method === 'GET' && url.pathname === '/api/review/issue') {
          const issue = store.issues().find(item => item.id === url.searchParams.get('id'));
          if (!issue) return json(response, 404, { error: 'Review issue not found' });
          return json(response, 200, reviewEvidence(store, issue));
        }
        if (request.method === 'GET' && url.pathname === '/api/review/record') {
          const id = url.searchParams.get('id') || '';
          const entity = store.entity(id);
          return json(response, 200, entity ? { entity, fields: store.fields(id), observations: store.linkedObservations(id), corrections: store.overrides(`entity:${id}`) }
            : { observation: store.head(id), link: store.link(id), corrections: store.overrides(id) });
        }
        if (request.method === 'POST') {
          const body = await readJson(request);
          if (url.pathname === '/api/review/metadata-candidate') {
            const initialIssue = store.issues().find(item => item.id === body.issueId);
            if (!initialIssue?.subject.startsWith('metadata:')) throw new Error('Choose a metadata review item');
            if (body.revision !== store.revision || body.evidenceFingerprint !== initialIssue.fingerprint) throw new ReviewConflict('Evidence changed. Reload this issue before adding a candidate.');
            if (!process.env.TMDB_API_KEY) throw new Error('A TMDb API key is required to verify a custom database identity. You can still edit source fields.');
            const input = String(body.tmdbId ?? '').trim();
            let identifier = input;
            if (/^https:\/\//i.test(input)) {
              const parsed = new URL(input);
              if (!['www.themoviedb.org', 'themoviedb.org'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('Enter a TMDb movie ID or a themoviedb.org/movie URL');
              identifier = parsed.pathname.replace(/^\/movie\//, '');
            }
            const match = identifier.match(/^(\d+)(?:-[^/]+)?\/?$/);
            const id = match ? Number(match[1]) : 0;
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Enter a TMDb movie ID or a themoviedb.org/movie URL');
            const full = await new TmdbClient(process.env.TMDB_API_KEY).getMovieDetails(id);
            if (!full) throw new Error('TMDb could not verify that movie. No identity was added. Check the ID or try again after the service recovers.');
            const candidate = { ...tmdbCandidate(full), manuallyRetrieved: true };
            const evidence = mutate(() => store.transaction(() => {
              const issue = store.issues().find(item => item.id === body.issueId);
              if (!issue?.subject.startsWith('metadata:')) throw new Error('Choose a metadata review item');
              if (body.revision !== store.revision || body.evidenceFingerprint !== issue.fingerprint) throw new ReviewConflict('Evidence changed. Reload this issue before adding a candidate.');
              store.saveResource(`tmdb-detail:${id}`, full);
              const updated = store.issue({ ...issue, details: { ...issue.details,
                candidates: [...(issue.details.candidates ?? []).filter((c: any) => c.id !== id), candidate] } });
              return reviewEvidence(store, updated);
            }));
            return json(response, 200, { candidate, evidence });
          }
          if (url.pathname === '/api/review/open-record') {
            const issue = mutate(() => store.transaction(() => {
              const entity = store.entity(String(body.entityId)); if (!entity) throw new Error('Record not found');
              const evidence = fieldEvidence(store, entity.id);
              const item = store.issue({ type: 'field-review', subject: `entity:${entity.id}`, title: `Review selected fields: ${entity.name}`,
                status: 'open', priority: 50, fingerprint: evidence,
                details: { entityId: entity.id, entity, fieldEvidence: evidence, fields: store.fields(entity.id), observations: store.linkedObservations(entity.id) } });
              store.reopenIssue(item.id); return item;
            }));
            return json(response, 200, { issueId: issue.id });
          }
          if (url.pathname === '/api/review/preview') {
            const preview = previewReview(store, body);
            return json(response, 200, { description: preview.description, affected: preview.affected, patch: preview.patch, target: preview.target });
          }
          if (url.pathname === '/api/review/apply') {
            const result = mutate(() => store.transaction(() => ({ ...applyReview(store, body), jobId: store.createJob('recalculate') })));
            schedule(result.jobId); return json(response, 202, result);
          }
          if (url.pathname === '/api/review/revoke') {
            const result = mutate(() => store.transaction(() => {
              if (body.revision !== store.revision) throw new ReviewConflict('Corrections changed. Reload before undoing.');
              if (!Array.isArray(body.overrideIds) || body.overrideIds.length > 10) throw new Error('Choose corrections to undo');
              for (const id of body.overrideIds) store.revokeOverride(id);
              return { revision: store.revision, jobId: store.createJob('recalculate') };
            }));
            schedule(result.jobId); return json(response, 202, result);
          }
          if (url.pathname === '/api/review/recalculate') return json(response, 202, { jobId: enqueue() });
        }
        return json(response, 404, { error: 'Unknown local endpoint' });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'Method not allowed' });
      // The local editor must always use the current build, including after an older PWA cached its app shell.
      if (url.pathname === '/sw.js') {
        response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        return response.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));");
      }
      // Serve current generated data directly: corrections do not require rebuilding the frontend bundle.
      const publicName = url.pathname === '/movies.json' || url.pathname === '/sitemap.xml' || url.pathname.startsWith('/audit/')
        ? path.join(root, 'public', decodeURIComponent(url.pathname)) : null;
      let filename = publicName ?? path.join(root, 'dist', decodeURIComponent(url.pathname));
      const allowedRoot = publicName ? path.join(root, 'public') : path.join(root, 'dist');
      if (!path.resolve(filename).startsWith(path.resolve(allowedRoot) + path.sep)) filename = path.join(root, 'dist/index.html');
      if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(root, 'dist/index.html');
      if (!fs.existsSync(filename)) return json(response, 503, { error: 'Build the frontend first: npm run build' });
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
      if (request.method === 'HEAD') response.end();
      else if (path.extname(filename) === '.html') response.end(fs.readFileSync(filename, 'utf8').replace(/<script\b[^>]*\bsrc=["']\/registerSW\.js["'][^>]*><\/script>/g, ''));
      else fs.createReadStream(filename).pipe(response);
    } catch (error) {
      json(response, error instanceof ReviewConflict ? 409 : 400, { error: safeMessage(error) });
    }
  });
  return server;
}
function safeMessage(error: unknown): string { return sanitizeAudit(error instanceof Error ? error.message : 'Operation failed'); }
function json(response: http.ServerResponse, status: number, data: any) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(sanitizeAudit(data)));
}
async function readJson(request: http.IncomingMessage): Promise<any> {
  const buffers: Buffer[] = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk); if (bytes > 128 * 1024) throw new Error('Request exceeds local review size limit'); buffers.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(buffers).toString('utf8'));
}
if (require.main === module) {
  const store = new PipelineStore(); const port = Number(process.env.ADMIN_PORT || 3003);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ADMIN_PORT');
  const server = createAdminServer(store, { port });
  server.listen(port, '127.0.0.1', () => console.log(`Local review: http://127.0.0.1:${port}/admin/review\nCorrections are saved in pipeline/state.json. Commit and push that file to share them with scheduled refreshes.`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  process.on('SIGINT', () => server.close(() => { store.close(); process.exit(0); }));
}
