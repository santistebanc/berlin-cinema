import { Entity, fingerprint, normalize } from './domain';
import { PipelineStore } from './store';
import { parseLabel } from './labels';

export function filmMetadataInput(entity: Entity) {
  return { title: entity.name, titles: entity.data.titles, year: entity.data.year, director: entity.data.director };
}

export function creditNames(value: any): string[] {
  return [...new Set<string>((Array.isArray(value) ? value : value ? String(value).split(/[,;]/) : [])
    // Credit providers may write the surname first. Compare complete name tokens, never partial names.
    .map(person => normalize((typeof person === 'string' ? person : person?.name || '')
      .replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[đĐðÐ]/g, 'd').replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe'))
      .split(' ').filter(Boolean).sort().join(' ')).filter(Boolean))];
}
export function sharedCast(a: any, b: any): number {
  const right = new Set(creditNames(b.cast));
  return creditNames(a.cast).filter(person => right.has(person)).length;
}
export function sharedDirector(a: any, b: any): boolean {
  const right = new Set(creditNames(b.directors?.length ? b.directors : b.director));
  return creditNames(a.directors?.length ? a.directors : a.director).some(person => right.has(person));
}
export function sameFilmWithDifferentYear(a: any, b: any): boolean {
  if (!a.year || !b.year || Math.abs(Number(a.year) - Number(b.year)) <= 1 || !sharedDirector(a, b) || sharedCast(a, b) < 2) return false;
  const titles = (value: any) => [value.title, value.rawTitle, value.originalTitle, value.tmdbTitle,
    ...(value.titles ?? []), ...(value.alternativeTitles ?? [])].filter(Boolean).map(title => normalize(parseLabel(title).title)).filter(Boolean);
  const right = new Set(titles(b));
  return titles(a).some(title => right.has(title));
}
/** Names retrieve candidates; independent credits/years or accepted IDs support identity. */
export function supportsFilmIdentity(a: any, b: any): boolean {
  if (a.verifiedImdbId && b.verifiedImdbId && a.verifiedImdbId === b.verifiedImdbId) return true;
  if (a.tmdbId && b.tmdbId && a.tmdbId === b.tmdbId) return true;
  const year = a.year && b.year && Math.abs(Number(a.year) - Number(b.year)) <= 1;
  const cast = sharedCast(a, b) >= 2;
  const titles = (value: any) => [value.title, value.rawTitle, value.originalTitle, value.tmdbTitle,
    ...(value.titles ?? []), ...(value.alternativeTitles ?? [])].filter(Boolean).map(title => normalize(parseLabel(title).title)).filter(Boolean);
  const rightTitles = new Set(titles(b));
  const fullTitle = titles(a).some(title => rightTitles.has(title));
  const compatibleYear = !a.year || !b.year || !!year;
  return sharedDirector(a, b) && (!!year || cast || fullTitle && compatibleYear) || !!year && cast;
}

/** Validates each source separately against retained provider credits, never against search ranking. */
export class CachedFilmEvidence {
  private candidates: any[];
  private matches = new Map<string, { provider: 'TMDb'; id: number; imdbId: string | null; fetchedAt: string } | null>();
  constructor(store: PipelineStore, now = new Date().toISOString()) {
    const localizedTitles = new Map<number, Set<string>>();
    for (const resource of store.resources('tmdb-search:')) {
      if (!Array.isArray(resource.data) || Date.parse(now) - Date.parse(resource.fetchedAt) > 7 * 86400000) continue;
      for (const result of resource.data) {
        if (!Number.isInteger(result.id)) continue;
        const titles = localizedTitles.get(result.id) ?? new Set<string>();
        for (const title of [result.title, result.original_title].filter(Boolean)) titles.add(title);
        localizedTitles.set(result.id, titles);
      }
    }
    this.candidates = store.resources('tmdb-detail:').filter(resource => Date.parse(now) - Date.parse(resource.fetchedAt) <= 7 * 86400000)
      .flatMap(resource => {
        const data = resource.data; const movie = data.details;
        if (!movie?.id || resource.key !== `tmdb-detail:${movie.id}`) return [];
        return [{ id: movie.id, fetchedAt: resource.fetchedAt, title: movie.title,
          titles: [movie.title, movie.original_title, ...(localizedTitles.get(movie.id) ?? []), ...(data.alternativeTitles ?? []).map((item: any) => item.title),
            ...(data.translations?.translations ?? []).map((item: any) => item.data?.title)].filter(Boolean),
          year: Number(movie.release_date?.slice(0, 4)) || null,
          directors: (data.credits?.crew ?? []).filter((person: any) => ['Director', 'Co-Director'].includes(person.job)).map((person: any) => person.name),
          cast: (data.credits?.cast ?? []).map((person: any) => person.name),
          imdbId: data.externalIds?.imdb_id || movie.imdb_id || null }];
      });
    for (const candidate of this.candidates) candidate.titleKeys = candidate.titles.map((title: string) => normalize(title));
  }
  match(input: any): { provider: 'TMDb'; id: number; imdbId: string | null; fetchedAt: string } | null {
    if (!creditNames(input.directors?.length ? input.directors : input.director).length && creditNames(input.cast).length < 2
      && !input.verifiedImdbId && !input.tmdbId) return null;
    // This bounded annotation can broaden retrieval; independent credits/year still establish identity.
    const titles: string[] = [input.originalTitle, input.title, ...(input.titles ?? [])].filter(Boolean)
      .flatMap(title => [normalize(title), normalize(title.replace(/\s*\(live\s+action\)\s*$/i, ''))]).filter(Boolean);
    const key = fingerprint({ titles, year: input.year, director: input.directors ?? input.director, cast: creditNames(input.cast).sort(),
      tmdbId: input.tmdbId, verifiedImdbId: input.verifiedImdbId });
    if (this.matches.has(key)) return this.matches.get(key)!;
    const candidates = this.candidates.filter(candidate => titles.some(title => candidate.titleKeys.some((label: string) => {
      if (title === label) return true;
      const tokens = new Set(title.split(' ').filter(token => token.length > 2));
      return new Set(label.split(' ').filter(token => tokens.has(token))).size >= 2;
    })) && supportsFilmIdentity(input, candidate)
      && !(input.year && candidate.year && Math.abs(Number(input.year) - candidate.year) > 1 && !sameFilmWithDifferentYear(input, candidate))
      && !(creditNames(input.directors?.length ? input.directors : input.director).length && candidate.directors.length && !sharedDirector(input, candidate))
      && !(input.verifiedImdbId && candidate.imdbId && input.verifiedImdbId !== candidate.imdbId)
      && !(input.tmdbId && input.tmdbId !== candidate.id));
    if (candidates.length !== 1) { this.matches.set(key, null); return null; }
    const chosen = candidates[0];
    const result = { provider: 'TMDb' as const, id: chosen.id, imdbId: chosen.imdbId, fetchedAt: chosen.fetchedAt };
    this.matches.set(key, result); return result;
  }
}
