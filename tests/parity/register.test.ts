/**
 * Parity: TS register prediction vs the oracle (glean/voice/register.py).
 * Exact: levels, fail-formal rule, boundary cases, note strings.
 */
import { describe, expect, it } from "vitest";
import { formalityScore, styleFeatureVector } from "../../src/intel/features";
import { formalityLevel, levelNote } from "../../src/intel/register";
import corpusJson from "../fixtures/oracle/corpus.json";
import registerJson from "../fixtures/oracle/register.json";

interface OracleRegister {
	recipients: Record<string, { mean: number; n: number; level: string }>;
	edge_cases: { mean: number | null; n: number; level: string }[];
	level_notes: Record<string, string>;
}

const oracle = registerJson as OracleRegister;
const corpus = (
	corpusJson as { emails: { id: string; to: string; text: string }[] }
).emails;

describe("register parity", () => {
	it("per-recipient mean formality + level match the oracle", () => {
		const byRecipient = new Map<string, number[]>();
		for (const e of corpus) {
			const list = byRecipient.get(e.to) ?? [];
			list.push(formalityScore(e.text));
			byRecipient.set(e.to, list);
		}
		for (const [addr, expected] of Object.entries(oracle.recipients)) {
			const scores = byRecipient.get(addr);
			if (!scores) throw new Error(`missing recipient ${addr}`);
			const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
			expect(Math.abs(mean - expected.mean), addr).toBeLessThanOrEqual(1e-9);
			expect(scores.length).toBe(expected.n);
			expect(formalityLevel(mean, scores.length)).toBe(expected.level);
		}
	});

	it.each(
		oracle.edge_cases.map((c, i) => [i, c] as const),
	)("edge case %d (fail-formal + band boundaries)", (_i, c) => {
		expect(formalityLevel(c.mean, c.n)).toBe(c.level);
	});

	it("level notes are the exact Python strings", () => {
		for (const [level, note] of Object.entries(oracle.level_notes)) {
			expect(levelNote(level)).toBe(note);
		}
	});

	it("unknown level falls back to the formal note", () => {
		expect(levelNote("nonsense")).toBe(oracle.level_notes.formal);
	});

	it("styleFeatureVector formality dim is the register input (sanity wire-up)", () => {
		const v = styleFeatureVector(corpus[0].text);
		expect(v[0]).toBe(formalityScore(corpus[0].text));
	});
});
