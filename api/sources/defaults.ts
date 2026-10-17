import { SourceRegistry } from './registry';
import { criticAdapter } from './critic';
import { berlinAdapter } from './berlin';
import type { SourceInstance } from './types';
import fs from 'fs';

export const defaultInstances: SourceInstance[] = [
  { id: 'critic.de', adapterId: 'critic.de', enabled: true, cacheIdentity: 'critic', legacyCache: true,
    retainedFile: 'critic-raw.json', config: {}, limits: { requests: 300, filmDetails: 40, venueDetails: 100 } },
  { id: 'berlin.de', adapterId: 'berlin.de', enabled: true, cacheIdentity: 'berlin', legacyCache: true,
    retainedFile: 'berlin-raw.json', config: {}, limits: { requests: 300, filmDetails: 40, venueDetails: 100 } },
];
export const defaultRegistry = new SourceRegistry([criticAdapter, berlinAdapter], defaultInstances);

/** Configuration changes acquisition only; historical observations remain in the evidence store. */
export function configuredRegistry(): SourceRegistry {
  const instances: SourceInstance[] = process.env.SOURCE_INSTANCES_FILE
    ? JSON.parse(fs.readFileSync(process.env.SOURCE_INSTANCES_FILE, 'utf8')) : defaultInstances;
  const disabled = (process.env.SOURCE_DISABLED ?? '').split(',').map(id => id.trim());
  return new SourceRegistry([criticAdapter, berlinAdapter], instances).withSelection({ disabled });
}
