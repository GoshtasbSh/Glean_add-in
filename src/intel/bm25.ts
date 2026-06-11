/**
 * Hand-rolled Okapi BM25 — design doc §1-MACRO (no library; ~60 lines).
 * Lexical leg of hybrid retrieval over project chunks; fused with dense
 * cosine by RRF (rrf.ts).
 *
 * idf = ln(1 + (N - df + 0.5)/(df + 0.5))  — non-negative variant.
 * tf component = tf*(k1+1) / (tf + k1*(1 - b + b*dl/avgdl)), k1=1.5, b=0.75.
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** BM25 score of every doc for the query (same order as docs). */
export function bm25Scores(query: string, docs: readonly string[]): number[] {
  const qTerms = tokenize(query);
  const docTokens = docs.map(tokenize);
  const n = docs.length;
  if (n === 0 || qTerms.length === 0) return docs.map(() => 0);
  const avgdl = docTokens.reduce((a, t) => a + t.length, 0) / n;
  if (avgdl === 0) return docs.map(() => 0); // all docs empty -> NaN denominators

  const df = new Map<string, number>();
  for (const term of new Set(qTerms)) {
    let count = 0;
    for (const toks of docTokens) if (toks.includes(term)) count++;
    df.set(term, count);
  }

  return docTokens.map((toks) => {
    let score = 0;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const term of new Set(qTerms)) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const d = df.get(term) ?? 0;
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * toks.length) / avgdl));
    }
    return score;
  });
}

export interface ScoredDoc {
  id: string;
  score: number;
}

/** Docs ranked by BM25 descending (stable on ties). */
export function bm25Rank(query: string, docs: readonly { id: string; text: string }[]): ScoredDoc[] {
  const scores = bm25Scores(query, docs.map((d) => d.text));
  return docs
    .map((d, i) => ({ id: d.id, score: scores[i] }))
    .sort((a, b) => b.score - a.score);
}
