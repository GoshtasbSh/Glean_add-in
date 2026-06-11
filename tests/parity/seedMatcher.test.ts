/**
 * Parity: TS seed-matcher vs the oracle (mirror of glean/labels/seed_matcher.py
 * ordered scan + min_sim floor). Sims 1e-9; tagged list exact; the
 * research-heavy fixture is the only floor crossing.
 */
import { describe, expect, it } from "vitest";
import { fakeEmbed } from "../../src/intel/fakeEmbedder";
import { DEFAULT_LABELS } from "../../src/intel/labelSeeds";
import { buildSeedQueryText, seedMatch } from "../../src/intel/seedMatcher";
import labelsJson from "../fixtures/oracle/labels.json";

interface OracleLabels {
  params: { min_sim: number; embed_prefix: string };
  fixture_ids: string[];
  labels: {
    name: string;
    query_text: string;
    sims: { id: string; sim: number }[];
    tagged: string[];
  }[];
}

const oracle = labelsJson as OracleLabels;

// The oracle's 20 fixtures: 19 corpus emails + research-heavy. Their embeddings
// are reproducible from sims' ids + corpus, but for the matcher we just need
// vecs; rebuild from the corpus texts used by the export script.
import corpusJson from "../fixtures/oracle/corpus.json";
const corpus = (corpusJson as { emails: { id: string; text: string }[] }).emails;
const RESEARCH_HEAVY_TEXT =
  "Hi Sarah,\n\nUpdate on grants and funding: the manuscripts and " +
  "submissions are in, peer review is scheduled, and the lab and " +
  "collaborators agreed on conferences, data and methods.\n\nThanks,\nGoshtasb";

function fixtureText(id: string): string {
  if (id === "research-heavy") return RESEARCH_HEAVY_TEXT;
  const e = corpus.find((c) => c.id === id);
  if (!e) throw new Error(`unknown fixture ${id}`);
  return e.text;
}

const fixtures = oracle.fixture_ids.map((id) => ({
  id,
  vec: fakeEmbed(oracle.params.embed_prefix + fixtureText(id)),
}));

describe("seed matcher parity", () => {
  it.each(oracle.labels.map((l) => [l.name, l] as const))(
    "label %s: query text, sims (1e-9), tagged exact",
    (_name, label) => {
      const seed = DEFAULT_LABELS.find((l) => l.name === label.name);
      if (!seed) throw new Error(`label ${label.name} missing from labelSeeds`);
      expect(buildSeedQueryText(seed.name, seed.description, oracle.params.embed_prefix)).toBe(
        label.query_text,
      );
      const qvec = fakeEmbed(label.query_text);
      const result = seedMatch(qvec, fixtures, oracle.params.min_sim);
      expect(result.sims.map((s) => s.id)).toEqual(label.sims.map((s) => s.id));
      for (let i = 0; i < result.sims.length; i++) {
        expect(Math.abs(result.sims[i].sim - label.sims[i].sim)).toBeLessThanOrEqual(1e-9);
      }
      expect(result.tagged).toEqual(label.tagged);
    },
  );

  it("only Research tags research-heavy; nothing else crosses the floor", () => {
    const research = oracle.labels.find((l) => l.name === "Research");
    expect(research?.tagged).toEqual(["research-heavy"]);
    for (const l of oracle.labels) {
      if (l.name !== "Research") expect(l.tagged).toEqual([]);
    }
  });

  it("DEFAULT_LABELS ports the legacy taxonomy (12 labels, 4 non-exclusive)", () => {
    expect(DEFAULT_LABELS).toHaveLength(12);
    expect(DEFAULT_LABELS.filter((l) => !l.exclusive).map((l) => l.name).sort()).toEqual([
      "Personal",
      "Research",
      "Service",
      "Teaching",
    ]);
    expect(DEFAULT_LABELS.find((l) => l.name === "To Respond")?.needsDraft).toBe(true);
  });
});
