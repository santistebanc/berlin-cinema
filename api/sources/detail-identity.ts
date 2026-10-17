import type { Diagnostic, FilmDetailIdentity } from '../../shared/contracts';
import { normalize } from '../pipeline/domain';
import { parseLabel } from '../pipeline/labels';
import { supportsFilmIdentity } from '../pipeline/identity-evidence';
import { identityConflict } from '../pipeline/resolve';

/** Keep the source description at collection time; URL continuity is not identity. */
export function filmDetailIdentity(data: any): FilmDetailIdentity {
  const label = parseLabel(data.rawTitle || data.title || '');
  return { title: label.title || undefined, director: data.director, cast: data.cast,
    year: Number(data.year) || label.year || undefined };
}

export function compatibleFilmDetails(movie: any, details: { fields: Record<string, any>; listingIdentity?: FilmDetailIdentity },
  origins: FilmDetailIdentity[] = []): boolean {
  const current = filmDetailIdentity(movie);
  // Historical caches may lack a title binding. Their supported credit/year
  // evidence remains usable only when it does not contradict the current listing.
  if (identityConflict(current, filmDetailIdentity(details.fields))) return false;
  return [...origins, ...(details.listingIdentity ? [details.listingIdentity] : [])].every(original =>
    !identityConflict(current, original) && (!original.title || !current.title
      || normalize(original.title) === normalize(current.title) || supportsFilmIdentity(original, current)));
}

export function detailIdentityConflict(source: string, details: { url: string; fetchedAt: string }): Diagnostic {
  return { schemaVersion: 1, category: 'data-quality', stage: 'film-details', code: 'detail-identity-conflict',
    sourceInstanceId: source, reason: 'Cached detail identity is incompatible with the current listing; optional cached fields were withheld.',
    retryable: false, evidence: { url: details.url, fetchedAt: details.fetchedAt } };
}
