/**
 * bm25.ts + rrf.ts — hybrid retrieval (design doc §1-MACRO).
 * Tiny fixed corpus with hand-computed expected rankings.
 */
import { describe, expect, it } from "vitest";
import { bm25Scores, bm25Rank } from "../src/intel/bm25";
import { rrfFuse } from "../src/intel/rrf";

const DOCS = [
  { id: "d0", text: "posterior plots for the cedar key model" },
  { id: "d1", text: "lab meeting agenda for next week" },
  { id: "d2", text: "cedar key sampling run posterior" },
  { id: "d3", text: "grant budget revision for travel" },
];

describe("bm25", () => {
  it("ranks both-term docs above no-term docs; shorter doc wins (hand-computed)", () => {
    // Query "posterior cedar": d0 and d2 contain both terms; d2 is shorter
    // (dl 5 vs 7, avgdl 5.75) so its tf normalisation is higher -> d2 > d0.
    // d1/d3 share no terms -> score exactly 0.
    const ranked = bm25Rank("posterior cedar", DOCS);
    expect(ranked.map((r) => r.id).slice(0, 2)).toEqual(["d2", "d0"]);
    const scores = bm25Scores("posterior cedar", DOCS.map((d) => d.text));
    expect(scores[1]).toBe(0);
    expect(scores[3]).toBe(0);
    expect(scores[2]).toBeGreaterThan(scores[0]);
  });

  it("idf: a term in every doc contributes little but stays non-negative", () => {
    const scores = bm25Scores("for", DOCS.map((d) => d.text));
    // "for" appears in d0,d1,d3 (3 of 4 docs) -> low idf, but BM25+ln(1+x) keeps >= 0
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(0);
  });

  it("empty query or empty corpus give empty/zero results", () => {
    expect(bm25Scores("", DOCS.map((d) => d.text))).toEqual([0, 0, 0, 0]);
    expect(bm25Rank("x", [])).toEqual([]);
  });
});

describe("rrf", () => {
  it("fuses two rankings with k=60 (hand-computed order a > c > b > d)", () => {
    // dense: a,b,c,d ; bm25: c,a,d,b
    // a: 1/61+1/62=.03252  c: 1/63+1/61=.03227  b: 1/62+1/64=.03175  d: 1/64+1/63=.03150
    const fused = rrfFuse([["a", "b", "c", "d"], ["c", "a", "d", "b"]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "c", "b", "d"]);
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 62, 12);
  });

  it("item present in only one ranking still scores", () => {
    const fused = rrfFuse([["a"], ["b"]]);
    expect(fused.map((f) => f.id).sort()).toEqual(["a", "b"]);
    expect(fused[0].score).toBeCloseTo(1 / 61, 12);
  });

  it("topN caps the result (default 6 used by the pipeline)", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const fused = rrfFuse([ids], 6);
    expect(fused).toHaveLength(6);
  });
});
