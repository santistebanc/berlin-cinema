import fs from 'fs';
import path from 'path';
import type { PipelineStore } from '../pipeline/store';
import type { SourceRegistry } from './registry';
import { sourceDependencies } from './dependencies';
import { SourcePersistenceError, type SourceDependencies } from './types';

/** Disk compatibility belongs to acquisition, rather than the canonical resolver or React. */
export function retainedDependencies(store: PipelineStore, registry: SourceRegistry,
  options: { network?: boolean; force?: boolean; now?: string; dataDir?: string } = {}): SourceDependencies {
  const deps = sourceDependencies(store, options);
  const instanceFor = (key: string) => registry.instances.find(instance => key === `source-collection:${instance.cacheIdentity}`);
  const filename = (instance: SourceRegistry['instances'][number]) => {
    const name = instance.retainedFile ?? `${encodeURIComponent(instance.cacheIdentity)}-collection.json`;
    if (path.basename(name) !== name) throw new SourcePersistenceError('Retained source filename must be a basename');
    return path.join(options.dataDir ?? path.join(__dirname, '../../data'), name);
  };
  return { ...deps, cache: {
    get(key) {
      const instance = instanceFor(key);
      if (!instance) return deps.cache.get(key);
      try {
        const file = filename(instance);
        if (!fs.existsSync(file)) return deps.cache.get(key);
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const adapter = registry.adapter(instance);
        const data = raw?.schemaVersion === 1 ? raw : adapter.replay?.(raw, instance);
        return data ? { data, fetchedAt: data.observedAt } : undefined;
      } catch (error) { throw new SourcePersistenceError(`Cannot read retained source ${instance.id}: ${(error as Error).message}`); }
    },
    set(key, data, at) {
      const instance = instanceFor(key);
      if (!instance) return deps.cache.set(key, data, at);
      const file = filename(instance); const temporary = `${file}.${process.pid}.tmp`;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(temporary, JSON.stringify(data)); fs.renameSync(temporary, file);
      } catch (error) { throw new SourcePersistenceError(`Cannot save retained source ${instance.id}: ${(error as Error).message}`); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    },
  } };
}
