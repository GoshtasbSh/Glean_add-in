/**
 * Parity: TS kNN vs the oracle (mirror of glean/classify/knn.py decision block).
 *
 * Ranking order exact; similarities 1e-9; decisions exact (incl. the
 * offtopic-synthetic null via the similarity-threshold gate).
 */
import { describe, expect, it } from "vitest";
import { fakeEmbed } from "../../src/intel/fakeEmbedder";
import { knnClassify, knnDecide } from "../../src/intel/knn";
import corpusJson from "../fixtures/oracle/corpus.json";
import knnJson from "../fixtures/oracle/knn.json";

interface KnnQuery {
  query_id: string;
  true_label: string;
  ranking: string[];
  top_k: { id: string; label: string; sim: number }[];
  decision: { label: string; confidence: number; source: string } | null;
}
interface OracleKnn {
  params: {
    k: number;
    threshold: number;
    min_agreement: number;
    margin: number;
    min_neighbors: number;
    embed_prefix: string;
  };
  queries: KnnQuery[];
}

const oracle = knnJson as OracleKnn;
const corpus = (corpusJson as { emails: { id: string; register: string; text: string }[] }).emails;

const OFFTOPIC_TEXT =
  "Quadcopter gyroscope firmware: recalibrate geofence boundary, reflash bootloader.";

function queryText(id: string): string {
  if (id === "offtopic-synthetic") return OFFTOPIC_TEXT;
  const e = corpus.find((c) => c.id === id);
  if (!e) throw new Error(`unknown query ${id}`);
  return e.text;
}

const { embed_prefix: prefix, ...params } = oracle.params;
const opts = {
  k: params.k,
  threshold: params.threshold,
  minAgreement: params.min_agreement,
  margin: params.margin,
  minNeighbors: params.min_neighbors,
};

describe("knn parity", () => {
  const items = corpus.map((e) => ({
    id: e.id,
    label: e.register,
    vec: fakeEmbed(prefix + e.text),
  }));

  it.each(oracle.queries.map((q) => [q.query_id, q] as const))(
    "query %s: ranking order, sims, decision all match",
    (_id, q) => {
      const qvec = fakeEmbed(prefix + queryText(q.query_id));
      const candidates = items.filter((i) => i.id !== q.query_id);
      const result = knnClassify(qvec, candidates, opts);

      expect(result.ranking.map((r) => r.id)).toEqual(q.ranking);
      for (let i = 0; i < q.top_k.length; i++) {
        expect(result.topK[i].id).toBe(q.top_k[i].id);
        expect(Math.abs(result.topK[i].sim - q.top_k[i].sim)).toBeLessThanOrEqual(1e-9);
      }
      if (q.decision === null) {
        expect(result.decision).toBeNull();
      } else {
        expect(result.decision?.label).toBe(q.decision.label);
        expect(Math.abs((result.decision?.confidence ?? 0) - q.decision.confidence)).toBeLessThanOrEqual(1e-9);
        expect(result.decision?.source).toBe("knn");
      }
    },
  );
});

describe("knnDecide gates (knn.py:77-97 semantics)", () => {
  it("returns null below minNeighbors", () => {
    expect(knnDecide([{ label: "a", sim: 0.99 }], opts)).toBeNull();
  });
  it("returns null on split vote (agreement gate)", () => {
    const rows = [
      { label: "a", sim: 0.9 },
      { label: "a", sim: 0.89 },
      { label: "b", sim: 0.88 },
      { label: "b", sim: 0.87 },
    ];
    expect(knnDecide(rows, { ...opts, k: 4 })).toBeNull();
  });
  it("returns null when margin gate fails", () => {
    const rows = [
      { label: "a", sim: 0.9 },
      { label: "a", sim: 0.89 },
      { label: "b", sim: 0.88 }, // 0.9 - 0.88 = 0.02 < margin 0.06
    ];
    expect(knnDecide(rows, opts)).toBeNull();
  });
  it("1-1 split vote fails the agreement gate (share 0.5 < 0.66)", () => {
    const rows = [
      { label: "b", sim: 0.95 },
      { label: "a", sim: 0.7 },
    ];
    expect(knnDecide(rows, { ...opts, minNeighbors: 2, margin: 0.06 })).toBeNull();
  });

  it("count tie is broken by the closest neighbour and the winner is observable", () => {
    // 1-1 count tie, b wins on bestSim; relaxed agreement makes the
    // tie-break OBSERVABLE in the returned label (not masked by the share gate).
    const rows = [
      { label: "a", sim: 0.7 },
      { label: "b", sim: 0.95 },
    ];
    const d = knnDecide(rows, { ...opts, minNeighbors: 2, minAgreement: 0.5, margin: 0.1 });
    expect(d?.label).toBe("b");
    expect(d?.confidence).toBe(0.95);
  });
});
