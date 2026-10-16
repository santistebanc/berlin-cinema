import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PipelineStore } from '../api/pipeline/store';
import { refreshVenueObservations } from '../api/pipeline/source-venues';
import { GeoapifyGeocoder } from '../api/pipeline/geocoding';
import { venueAddressesMatch } from '../api/pipeline/addresses';
import { runPipeline } from '../api/pipeline/pipeline';

async function main() {
  const store = new PipelineStore(); const owner = randomUUID();
  const mutate = <T>(callback: () => T): T => {
    if (!store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
    try { return store.transaction(callback); } finally { store.releaseLease(owner); }
  };
  let jobId: string | undefined;
  try {
    jobId = mutate(() => store.createJob('recheck-locations'));
    mutate(() => store.updateJob(jobId!, 'processing', { kind: 'recheck-locations' }));
    if (!store.acquireLease(owner)) throw new Error('Another pipeline/admin writer is running. Retry after it finishes.');
    try {
      const venues = store.observations(undefined, true).filter(item => item.kind === 'venue');
      console.log(`Checking ${venues.length} active source venue records.`);
      const repaired = await refreshVenueObservations(store, venues, { network: true, force: true });
      console.log(`Recovered ${repaired.filter((item, index) => item.data.address && !venues[index].data.address).length} missing source addresses.`);
      // Revalidate only cached address failures that the current exact-address rules can establish.
      // Healthy caches and unrelated provider failures do not need new paid requests.
      const geocoder = new GeoapifyGeocoder(store, process.env.GEOAPIFY_API_KEY, { force: true, maxRequests: 20 });
      for (const issue of store.issues().filter(item => item.status === 'open' && item.type === 'venue-geocoding')) {
        const venue = store.head(issue.subject); const previous = issue.details.geocoding;
        if (venue?.data.address && previous?.query?.text && previous.candidates?.some((candidate: any) =>
          venueAddressesMatch(venue.data.address, candidate.address) && (candidate.confidence >= 0.95 || candidate.buildingConfidence >= 0.95))) {
          const result = await geocoder.lookup(venue.data as any);
          console.log(`${venue.data.name}: ${result.status}`);
        }
      }
      store.flush();
    } finally { store.releaseLease(owner); }
    const result = await runPipeline({ store });
    const cleanup = mutate(() => {
      const archived = store.cleanupSuperseded();
      store.updateJob(jobId!, 'published', { total: result.total, publishedAt: result.scrapedAt });
      return archived;
    });
    const remaining = [...new Set(store.issues().filter(issue => issue.status === 'open' && issue.type.startsWith('venue-')).map(issue => issue.subject))];
    console.log(JSON.stringify({ published: result.total, unresolvedVenues: remaining.length, ...cleanup }));
    for (const subject of remaining) console.log(JSON.stringify({ name: store.head(subject)?.data.name,
      issues: store.issues().filter(issue => issue.subject === subject && issue.status === 'open').map(issue => issue.title) }));
  } catch (error) {
    if (jobId) mutate(() => store.updateJob(jobId!, 'failed', { message: (error as Error).message }));
    throw error;
  } finally { store.close(); }
}
main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
