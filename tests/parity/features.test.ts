/**
 * Parity: TS stylometric features vs the Python oracle (glean/voice/style_features.py).
 *
 * Tolerance is 1e-9 per dimension (DoD §2). Any mismatch is a TS bug — never
 * regenerate the oracle to match TS.
 */
import { describe, expect, it } from "vitest";
import { FEATURE_NAMES, formalityScore, styleFeatureVector } from "../../src/intel/features";
import oracleJson from "../fixtures/oracle/features.json";

interface OracleFeatures {
  feature_names: string[];
  emails: { id: string; text: string; vector: number[]; formality: number }[];
}

const oracle = oracleJson as OracleFeatures;

describe("features parity", () => {
  it("feature names match the Python order exactly", () => {
    expect(FEATURE_NAMES).toEqual(oracle.feature_names);
  });

  it.each(oracle.emails.map((e) => [e.id, e] as const))(
    "styleFeatureVector(%s) matches oracle to 1e-9 per dimension",
    (_id, email) => {
      const vec = styleFeatureVector(email.text);
      expect(vec).toHaveLength(email.vector.length);
      for (let d = 0; d < vec.length; d++) {
        expect(Math.abs(vec[d] - email.vector[d]), `dim ${d} (${oracle.feature_names[d]})`).toBeLessThanOrEqual(1e-9);
      }
    },
  );

  it.each(oracle.emails.map((e) => [e.id, e] as const))(
    "formalityScore(%s) matches oracle exactly",
    (_id, email) => {
      expect(formalityScore(email.text)).toBe(email.formality);
    },
  );

  it("empty text yields the Python defaults (formality 0.5, zeros elsewhere)", () => {
    const vec = styleFeatureVector("");
    expect(vec[0]).toBe(0.5);
    expect(vec[1]).toBe(0.0); // log1p(0)
    expect(vec[2]).toBe(0.0); // 0 words / max(1, sentences)
  });
});
