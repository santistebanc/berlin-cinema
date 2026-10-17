import type { FilmDetailIdentity } from '../../shared/contracts';
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

export function compatibleFilmDetails(movie: any, details: { fields: Record<string, any>; listingIdentity?: FilmDetailIdentity }): boolean {
  const current = filmDetailIdentity(movie);
  // Historical caches may lack a title binding. Their supported credit/year
  // evidence remains usable only when it does not contradict the current listing.
  if (identityConflict(current, filmDetailIdentity(details.fields))) return false;
  if (!details.listingIdentity) return true;
  const original = details.listingIdentity;
  return !identityConflict(current, original) && (!original.title || !current.title
    || normalize(original.title) === normalize(current.title) || supportsFilmIdentity(original, current));
}
