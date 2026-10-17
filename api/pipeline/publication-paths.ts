import path from 'path';

/** Resolve once per operation so dataset, audit history and rollback share a root. */
export function resolvePublicationRoot(root?: string): string {
  return root ?? process.env.PIPELINE_PUBLIC_ROOT ?? path.join(__dirname, '../..');
}
