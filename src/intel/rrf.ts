/**
 * Reciprocal Rank Fusion — design doc §1-MACRO. Fuses the BM25 and dense
 * cosine rankings: score(d) = sum over rankings of 1/(k + rank(d)), k=60,
 * 1-based ranks, top 6 by default.
 */

export const RRF_K = 60;
export const RRF_TOP_N = 6;

export interface FusedDoc {
  id: string;
  score: number;
}

export function rrfFuse(rankings: readonly (readonly string[])[], topN: number = RRF_TOP_N): FusedDoc[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + idx + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
