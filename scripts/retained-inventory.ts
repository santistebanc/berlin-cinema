import { configuredStateFile, loadStateFile } from '../api/pipeline/state-file';
export function retainedInventory(state: any) {
  const count = (items: any[], key: (v: any) => string) => items.reduce((out, item) => { const k = key(item); out[k] = (out[k] ?? 0) + 1; return out; }, {} as Record<string, number>);
  return { schemaVersion: state.schemaVersion, revision: state.revision,
    counts: Object.fromEntries(Object.entries(state).map(([key, value]) => [key, value && typeof value === 'object' ? Object.keys(value).length : value])),
    observationsByKind: count(Object.values(state.observations), (o: any) => o.kind),
    observationsBySource: count(Object.values(state.observations), (o: any) => o.source),
    resourcesByPrefix: count(Object.keys(state.resources), (key: string) => key.split(':')[0]),
    snapshots: state.snapshots.map((s: any) => ({ createdAt: s.createdAt, total: s.data.total })),
    attributed: Object.values(state.observations).filter((o: any) => o.provenance).length,
    verifiedFields: Object.values(state.fields).flat().filter((f: any) => f.identityVerified).length };
}
if (require.main === module) console.log(JSON.stringify(retainedInventory(loadStateFile(process.argv[2] ?? configuredStateFile())), null, 2));
