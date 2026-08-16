import path from 'path';
import { pipeline } from '@xenova/transformers';
import { locationConflict } from './fuzzy-match';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const CACHE_DIR = path.join(__dirname, '../.cache/transformers');

export const EMBED_AUTO_MERGE = 0.82;
export const EMBED_MOVIE_AUTO_MERGE = 0.85;

type FeaturePipeline = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>;

let extractor: FeaturePipeline | null = null;
let loadPromise: Promise<FeaturePipeline> | null = null;

async function getExtractor(): Promise<FeaturePipeline> {
  if (extractor) return extractor;
  if (!loadPromise) {
    loadPromise = pipeline('feature-extraction', MODEL, {
      quantized: true,
      cache_dir: CACHE_DIR,
    }).then(pipe => {
      extractor = pipe;
      return pipe;
    });
  }
  return loadPromise;
}

type EmbeddingOutput = {
  data: { readonly length: number; [index: number]: number | bigint };
  dims?: number[];
};

function toVector(output: EmbeddingOutput, row = 0): number[] {
  const dims = output.dims ?? [output.data.length];
  const cols = dims.length === 2 ? dims[1] : output.data.length;
  const start = row * cols;
  const result: number[] = [];
  for (let i = start; i < start + cols; i++) {
    result.push(Number(output.data[i]));
  }
  return result;
}

/** Cosine similarity — vectors from this model are L2-normalized. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export async function embed(text: string): Promise<number[]> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: 'mean', normalize: true });
  return toVector(output);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ext = await getExtractor();
  const output = await ext(texts, { pooling: 'mean', normalize: true });
  const rows = output.dims?.[0] ?? 1;
  return Array.from({ length: rows }, (_, i) => toVector(output, i));
}

export async function embeddingSimilarity(a: string, b: string): Promise<number> {
  const [vecA, vecB] = await embedBatch([a, b]);
  return cosineSimilarity(vecA, vecB);
}

export async function warmEmbeddingModel(): Promise<void> {
  await getExtractor();
  console.log(`[resolver] Embedding model ready — ${MODEL}`);
}

export function cinemaEmbeddingText(name: string, address?: string): string {
  return address ? `${name}, ${address}, Berlin` : `${name}, Berlin`;
}

/** Best embedding match among candidates; returns null if below threshold or location conflict. */
export async function bestCinemaEmbeddingMatch(
  name: string,
  address: string | undefined,
  candidates: { canonical: string; address?: string }[],
  threshold = EMBED_AUTO_MERGE,
): Promise<{ canonical: string; score: number } | null> {
  if (candidates.length === 0) return null;

  const query = cinemaEmbeddingText(name, address);
  const texts = [query, ...candidates.map(c => cinemaEmbeddingText(c.canonical, c.address))];
  const vectors = await embedBatch(texts);
  const queryVec = vectors[0];

  let best: { canonical: string; score: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (locationConflict(name, candidate.canonical)) continue;

    const score = cosineSimilarity(queryVec, vectors[i + 1]);
    if (score >= threshold && (!best || score > best.score)) {
      best = { canonical: candidate.canonical, score };
    }
  }

  return best;
}

export async function movieEmbeddingSimilarity(
  titleA: string,
  titleB: string,
  metaA: { year?: number | null; director?: string | null } = {},
  metaB: { year?: number | null; director?: string | null } = {},
): Promise<number> {
  const textA = [titleA, metaA.year, metaA.director].filter(Boolean).join(' · ');
  const textB = [titleB, metaB.year, metaB.director].filter(Boolean).join(' · ');
  let score = await embeddingSimilarity(textA, textB);

  if (metaA.year && metaB.year && metaA.year !== metaB.year) {
    score *= 0.5;
  }

  return score;
}
