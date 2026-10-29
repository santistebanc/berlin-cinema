import { Entity, fingerprint, normalize } from './domain';
import { PipelineStore } from './store';
import { parseLabel } from './labels';
import { normalizePersonComparison } from '../../shared/text-normalization';
import { cachedDirectorAliases } from './person-aliases';

export function filmMetadataInput(entity: Entity) {
  return { title: entity.name, titles: entity.data.titles, year: entity.data.year, director: entity.data.director };
}

export function creditNames(value: any): string[] {
  return [...new Set<string>((Array.isArray(value) ? value : value ? String(value).split(/[,;]/) : [])
    // Credit providers may write the surname first. Compare complete name tokens, never partial names.
    .map(person => normalizePersonComparison(typeof person === 'string' ? person : person?.name || '')).filter(Boolean))];
}
export function sharedCast(a: any, b: any): number {
  const right = new Set(creditNames(b.cast));
  return creditNames(a.cast).filter(person => right.has(person)).length;
}
export function directorCreditNames(value: any): string[] {
  return creditNames([...creditNames(value.directors?.length ? value.directors : value.director),
    ...(Array.isArray(value.directorAliases) ? value.directorAliases : [])]);
}
export function sharedDirector(a: any, b: any): boolean {
  const right = new Set(directorCreditNames(b));
  return directorCreditNames(a).some(person => right.has(person));
}

function filmTitles(value: any): string[] {
  return [value.title, value.rawTitle, value.originalTitle, value.tmdbTitle,
    ...(value.titles ?? []), ...(value.alternativeTitles ?? [])].filter(Boolean)
    .map(title => normalize(parseLabel(title).title)).filter(Boolean);
}
export function fullTitleMatches(a: any, b: any): boolean {
  const right = new Set(filmTitles(b));
  return filmTitles(a).some(title => right.has(title));
}
function sameYearAndRuntime(a: any, b: any): boolean {
  if ([a, b].some(value => value.edition || parseLabel(value.rawTitle || value.title || '').modality.edition)) return false;
  return !!a.year && Number(a.year) === Number(b.year)
    && Number(a.runtime) > 0 && Number(b.runtime) > 0
    && Math.abs(Number(a.runtime) - Number(b.runtime)) <= 2;
}

/** Limited transliteration equivalence is usable only with independent title/year/runtime evidence. */
export function corroboratedDirectorTransliteration(a: any, b: any): boolean {
  if (!fullTitleMatches(a, b) || !sameYearAndRuntime(a, b)) return false;
  const keys = (value: any) => creditNames(value.directors?.length ? value.directors : value.director)
    .map(name => name.replace(/tch/g, 'ch').replace(/ou/g, 'u').replace(/gu(?=[ie])/g, 'g').replace(/ia/g, 'ya'));
  const right = new Set(keys(b));
  return keys(a).some(name => right.has(name));
}

/** Compare source country labels with provider country codes, including German labels. */
function sharedCountry(a: any, b: any): boolean {
  const labels = (value: any) => {
    const names = String(value.country ?? '').split(/[,;/]/).map(normalize).filter(Boolean);
    const codes = (value.productionCountries ?? []).map((country: any) => country.code || country.iso_3166_1);
    for (const code of codes) if (/^[A-Z]{2}$/.test(code ?? '')) {
      names.push(normalize(code));
      for (const locale of ['de', 'en', 'fr']) names.push(normalize(new Intl.DisplayNames([locale], { type: 'region' }).of(code) || ''));
    }
    return names.map(name => ({ usa: 'us', 'united states of america': 'us', 'united states': 'us',
      'vereinigte staaten': 'us', uk: 'gb', 'united kingdom': 'gb', 'grossbritannien': 'gb' }[name] ?? name));
  };
  const right = new Set(labels(b));
  return labels(a).some(name => right.has(name));
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
  const singleCastWithDetails = fullTitle && sameYearAndRuntime(a, b) && sharedCast(a, b) >= 1 && sharedCountry(a, b);
  return sharedDirector(a, b) && (!!year || cast || fullTitle && compatibleYear) || !!year && cast
    || singleCastWithDetails || corroboratedDirectorTransliteration(a, b);
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
          directorAliases: cachedDirectorAliases(store, data, now),
          cast: (data.credits?.cast ?? []).map((person: any) => person.name),
          runtime: movie.runtime, country: (movie.production_countries ?? []).map((country: any) => country.name).join(', '),
          productionCountries: (movie.production_countries ?? []).map((country: any) => ({ code: country.iso_3166_1, name: country.name })),
          imdbId: data.externalIds?.imdb_id || movie.imdb_id || null }];
      });
    for (const candidate of this.candidates) candidate.titleKeys = candidate.titles.map((title: string) => normalize(title));
  }
  match(input: any): { provider: 'TMDb'; id: number; imdbId: string | null; fetchedAt: string } | null {
    if (!creditNames(input.directors?.length ? input.directors : input.director).length && !creditNames(input.cast).length
      && !input.verifiedImdbId && !input.tmdbId) return null;
    // This bounded annotation can broaden retrieval; independent credits/year still establish identity.
    const titles: string[] = [input.originalTitle, input.title, ...(input.titles ?? [])].filter(Boolean)
      .flatMap(title => [normalize(title), normalize(title.replace(/\s*\(live\s+action\)\s*$/i, ''))]).filter(Boolean);
    const key = fingerprint({ titles, year: input.year, director: input.directors ?? input.director, cast: creditNames(input.cast).sort(),
      runtime: input.runtime, country: input.country, tmdbId: input.tmdbId, verifiedImdbId: input.verifiedImdbId });
    if (this.matches.has(key)) return this.matches.get(key)!;
    const candidates = this.candidates.filter(candidate => titles.some(title => candidate.titleKeys.some((label: string) => {
      if (title === label) return true;
      const tokens = new Set(title.split(' ').filter(token => token.length > 2));
      return new Set(label.split(' ').filter(token => tokens.has(token))).size >= 2;
    })) && supportsFilmIdentity(input, candidate)
      && !(input.year && candidate.year && Math.abs(Number(input.year) - candidate.year) > 1 && !sameFilmWithDifferentYear(input, candidate))
      && !(creditNames(input.directors?.length ? input.directors : input.director).length && candidate.directors.length
        && !sharedDirector(input, candidate) && !corroboratedDirectorTransliteration(input, candidate))
      && !(input.verifiedImdbId && candidate.imdbId && input.verifiedImdbId !== candidate.imdbId)
      && !(input.tmdbId && input.tmdbId !== candidate.id));
    if (candidates.length !== 1) { this.matches.set(key, null); return null; }
    const chosen = candidates[0];
    const result = { provider: 'TMDb' as const, id: chosen.id, imdbId: chosen.imdbId, fetchedAt: chosen.fetchedAt };
    this.matches.set(key, result); return result;
  }
}
