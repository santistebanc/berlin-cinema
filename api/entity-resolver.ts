import * as fs from 'fs';
import * as path from 'path';
import {
  EMBED_AUTO_MERGE,
  EMBED_MOVIE_AUTO_MERGE,
  bestCinemaEmbeddingMatch,
  movieEmbeddingSimilarity,
  warmEmbeddingModel,
} from './embedding-client';
import {
  cinemaMatchScore,
  FUZZY_AUTO_MERGE,
  FUZZY_EMBED_MIN,
  movieMatchScore,
  normalizeForMatch,
} from './fuzzy-match';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CinemaEntity {
  canonical: string;
  aliases: string[];
}

interface CacheEntry {
  same: boolean;
  confidence: number;
  reason: string;
  method: 'fuzzy' | 'embedding' | 'address';
  at: string;
}

interface DedupCache {
  cinemas: Record<string, CacheEntry>;
  movies: Record<string, CacheEntry>;
}

export interface CinemaCandidate {
  name: string;
  address?: string;
}

export interface ResolverOptions {
  entitiesPath?: string;
  cachePath?: string;
  autoMergeThreshold?: number;
  embedMinThreshold?: number;
  embedMinConfidence?: number;
  movieEmbedThreshold?: number;
}

// ---------------------------------------------------------------------------
// EntityResolver
// ---------------------------------------------------------------------------

export class EntityResolver {
  private entitiesPath: string;
  private cachePath: string;
  private entities: { cinemas: CinemaEntity[] };
  private cache: DedupCache;
  private aliasMap = new Map<string, string>();
  private discoveredAliases: { alias: string; canonical: string; method: string }[] = [];
  private autoMerge: number;
  private embedMin: number;
  private embedMinConfidence: number;
  private movieEmbedThreshold: number;

  constructor(opts: ResolverOptions = {}) {
    this.entitiesPath = opts.entitiesPath ?? path.join(__dirname, 'entities.json');
    this.cachePath = opts.cachePath ?? path.join(__dirname, 'dedup-cache.json');
    this.autoMerge = opts.autoMergeThreshold ?? FUZZY_AUTO_MERGE;
    this.embedMin = opts.embedMinThreshold ?? FUZZY_EMBED_MIN;
    this.embedMinConfidence = opts.embedMinConfidence ?? EMBED_AUTO_MERGE;
    this.movieEmbedThreshold = opts.movieEmbedThreshold ?? EMBED_MOVIE_AUTO_MERGE;

    this.entities = JSON.parse(fs.readFileSync(this.entitiesPath, 'utf-8'));
    this.cache = this.loadCache();
    this.rebuildAliasMap();
  }

  private loadCache(): DedupCache {
    if (!fs.existsSync(this.cachePath)) {
      return { cinemas: {}, movies: {} };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
      return { cinemas: raw.cinemas ?? {}, movies: raw.movies ?? {} };
    } catch {
      return { cinemas: {}, movies: {} };
    }
  }

  private rebuildAliasMap(): void {
    this.aliasMap.clear();
    for (const entry of this.entities.cinemas) {
      this.aliasMap.set(normalizeForMatch(entry.canonical), entry.canonical);
      for (const alias of entry.aliases) {
        this.aliasMap.set(normalizeForMatch(alias), entry.canonical);
      }
    }
  }

  private cacheKey(kind: 'cinemas' | 'movies', a: string, b: string): string {
    const pair = [normalizeForMatch(a), normalizeForMatch(b)].sort();
    return `${pair[0]}|${pair[1]}`;
  }

  getKnownCanonicals(): string[] {
    return this.entities.cinemas.map(e => e.canonical);
  }

  getDiscoveredAliases(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { alias, canonical } of this.discoveredAliases) {
      out[alias] = canonical;
    }
    return out;
  }

  resolveCinemaSync(name: string): string {
    return this.aliasMap.get(normalizeForMatch(name)) ?? name;
  }

  /** Resolve unknown cinema names against known canonicals (fuzzy → embeddings). */
  async resolveCinemas(candidates: CinemaCandidate[]): Promise<void> {
    const canonicals = this.getKnownCanonicals();
    const seen = new Set<string>();

    for (const { name, address } of candidates) {
      const norm = normalizeForMatch(name);
      if (seen.has(norm)) continue;
      seen.add(norm);
      if (this.aliasMap.has(norm)) continue;

      const match = await this.findBestCinemaMatch(name, address, canonicals);
      if (match) {
        this.registerAlias(name, match.canonical, match.method, match.reason);
        console.log(`[resolver] Cinema: "${name}" → "${match.canonical}" (${match.method}, ${match.score.toFixed(2)})`);
      }
    }
  }

  private async findBestCinemaMatch(
    name: string,
    address: string | undefined,
    canonicals: string[],
  ): Promise<{ canonical: string; score: number; method: string; reason: string } | null> {
    const fuzzyRanked = canonicals
      .map(canonical => ({ canonical, score: cinemaMatchScore(name, canonical, address) }))
      .sort((a, b) => b.score - a.score);

    const bestFuzzy = fuzzyRanked[0];
    if (!bestFuzzy) return null;

    if (bestFuzzy.score >= this.autoMerge) {
      return { ...bestFuzzy, method: 'fuzzy', reason: `token similarity ${bestFuzzy.score.toFixed(2)}` };
    }

    const cacheCandidate = bestFuzzy.score >= this.embedMin ? bestFuzzy.canonical : canonicals[0];
    const key = this.cacheKey('cinemas', name, cacheCandidate);
    const cached = this.cache.cinemas[key];
    if (cached && bestFuzzy.score >= this.embedMin) {
      if (cached.same && cached.confidence >= this.embedMinConfidence) {
        return { canonical: bestFuzzy.canonical, score: cached.confidence, method: cached.method, reason: cached.reason };
      }
      if (!cached.same) return null;
    }

    const fuzzyCandidates = fuzzyRanked
      .filter(c => c.score >= 0.5)
      .slice(0, 10)
      .map(c => ({ canonical: c.canonical }));
    const embedCandidates = fuzzyCandidates.length > 0
      ? fuzzyCandidates
      : canonicals.map(canonical => ({ canonical }));

    const embedMatch = await bestCinemaEmbeddingMatch(name, address, embedCandidates, this.embedMinConfidence);
    if (!embedMatch) return null;

    // Low fuzzy + moderate embedding can be a false positive — require higher embedding confidence
    if (bestFuzzy.score < 0.5 && embedMatch.score < 0.88) return null;

    const cacheKey = this.cacheKey('cinemas', name, embedMatch.canonical);
    this.cache.cinemas[cacheKey] = {
      same: true,
      confidence: embedMatch.score,
      reason: `embedding similarity ${embedMatch.score.toFixed(2)}`,
      method: 'embedding',
      at: new Date().toISOString(),
    };

    return {
      canonical: embedMatch.canonical,
      score: embedMatch.score,
      method: 'embedding',
      reason: `embedding similarity ${embedMatch.score.toFixed(2)}`,
    };
  }

  private registerAlias(alias: string, canonical: string, method: string, _reason: string): void {
    const norm = normalizeForMatch(alias);
    if (this.aliasMap.has(norm)) return;
    this.aliasMap.set(norm, canonical);
    this.discoveredAliases.push({ alias, canonical, method });

    const entry = this.entities.cinemas.find(e => e.canonical === canonical);
    if (entry && !entry.aliases.includes(alias)) {
      entry.aliases.push(alias);
    }
  }

  /** Register an alias discovered by OSM address matching. */
  registerOsmAlias(alias: string, canonical: string): void {
    const key = this.cacheKey('cinemas', alias, canonical);
    this.cache.cinemas[key] = {
      same: true,
      confidence: 0.99,
      reason: 'same OSM address',
      method: 'address',
      at: new Date().toISOString(),
    };
    this.registerAlias(alias, canonical, 'address', 'same OSM address');
  }

  /**
   * Post-enrichment movie dedup: fuzzy + embeddings for pairs that imdbId merge missed.
   * Mutates the movies array in place.
   */
  async deduplicateMovies(movies: any[]): Promise<number> {
    const removed = new Set<any>();
    let mergeCount = 0;

    for (let i = 0; i < movies.length; i++) {
      if (removed.has(movies[i])) continue;
      const a = movies[i];

      for (let j = i + 1; j < movies.length; j++) {
        if (removed.has(movies[j])) continue;
        const b = movies[j];

        if (a.imdbId && b.imdbId && a.imdbId === b.imdbId) continue;

        const score = movieMatchScore(a.title, b.title, {
          year: a.year, director: a.director, imdbId: a.imdbId, altTitle: a.altTitle,
        }, {
          year: b.year, director: b.director, imdbId: b.imdbId, altTitle: b.altTitle,
        });

        let shouldMerge = false;
        let method = '';
        let matchScore = score;

        if (score >= this.autoMerge) {
          shouldMerge = true;
          method = 'fuzzy';
        } else {
          const yearOk = !a.year || !b.year || a.year === b.year;
          const tryEmbed = score >= this.embedMin || (yearOk && score >= 0.45);

          if (tryEmbed) {
            const key = this.cacheKey('movies', a.title, b.title);
            const cached = this.cache.movies[key];
            if (cached) {
              shouldMerge = cached.same && cached.confidence >= this.movieEmbedThreshold;
              method = cached.method;
              matchScore = cached.confidence;
            } else {
              const embedScore = await movieEmbeddingSimilarity(
                a.title, b.title,
                { year: a.year, director: a.director },
                { year: b.year, director: b.director },
              );
              const same = embedScore >= this.movieEmbedThreshold;
              this.cache.movies[key] = {
                same,
                confidence: embedScore,
                reason: `embedding similarity ${embedScore.toFixed(2)}`,
                method: 'embedding',
                at: new Date().toISOString(),
              };
              shouldMerge = same;
              method = 'embedding';
              matchScore = embedScore;
            }
          }
        }

        if (shouldMerge) {
          const [primary, dup] = countShowings(a) >= countShowings(b) ? [a, b] : [b, a];
          mergeMovieRecords(primary, dup);
          removed.add(dup);
          mergeCount++;
          console.log(`[resolver] Movie: "${dup.title}" → "${primary.title}" (${method}, score ${matchScore.toFixed(2)})`);
        }
      }
    }

    if (removed.size > 0) {
      const kept = movies.filter(m => !removed.has(m));
      movies.length = 0;
      movies.push(...kept);
    }

    return mergeCount;
  }

  persist(): void {
    if (this.discoveredAliases.length > 0) {
      fs.writeFileSync(this.entitiesPath, JSON.stringify(this.entities, null, 2));
      console.log(`[resolver] Updated entities.json with ${this.discoveredAliases.length} alias(es)`);
    }
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countShowings(movie: any): number {
  let n = 0;
  for (const times of Object.values(movie.showings ?? {}) as Record<string, any[]>[]) {
    for (const entries of Object.values(times)) n += (entries as any[]).length;
  }
  return n;
}

export function mergeMovieRecords(primary: any, dup: any): void {
  for (const [date, times] of Object.entries(dup.showings ?? {})) {
    if (!primary.showings[date]) primary.showings[date] = {};
    for (const [time, entries] of Object.entries(times as Record<string, any[]>)) {
      if (!primary.showings[date][time]) primary.showings[date][time] = [];
      for (const entry of entries) {
        const entryKey = (entry.variants ?? []).slice().sort().join('|');
        const exists = primary.showings[date][time].some(
          (s: any) => s.cinema === entry.cinema && (s.variants ?? []).slice().sort().join('|') === entryKey,
        );
        if (!exists) primary.showings[date][time].push(entry);
      }
    }
  }

  const existingCinemaNames = new Set((primary.cinemas ?? []).map((c: any) => c.name));
  for (const cinema of dup.cinemas ?? []) {
    if (!existingCinemaNames.has(cinema.name)) primary.cinemas.push(cinema);
  }

  primary.variants = [...new Set([...(primary.variants ?? []), ...(dup.variants ?? [])])];
  primary.sourceTitles = [...new Set([...(primary.sourceTitles ?? []), ...(dup.sourceTitles ?? [dup.title])])];

  if (!primary.director && dup.director) primary.director = dup.director;
  if (!primary.posterUrl && dup.posterUrl) primary.posterUrl = dup.posterUrl;
  if (!primary.imdbId && dup.imdbId) primary.imdbId = dup.imdbId;
  if (!primary.tmdbTitle && dup.tmdbTitle) primary.tmdbTitle = dup.tmdbTitle;
}

export function collectCinemaCandidates(rawMovies: any[]): CinemaCandidate[] {
  const map = new Map<string, CinemaCandidate>();
  for (const movie of rawMovies) {
    for (const cinema of movie.cinemas ?? []) {
      const norm = normalizeForMatch(cinema.name);
      const existing = map.get(norm);
      if (!existing?.address && cinema.address) {
        map.set(norm, { name: cinema.name, address: cinema.address });
      } else if (!existing) {
        map.set(norm, { name: cinema.name, address: cinema.address });
      }
    }
    for (const showing of movie.showings ?? []) {
      const norm = normalizeForMatch(showing.cinema);
      if (!map.has(norm)) {
        map.set(norm, { name: showing.cinema, address: showing.address });
      }
    }
  }
  return Array.from(map.values());
}

export async function logResolverStatus(): Promise<void> {
  await warmEmbeddingModel();
}
