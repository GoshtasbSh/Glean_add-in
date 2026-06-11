/**
 * Parity + unit tests: vector math (dot/norm/cosine/argTopK) and the
 * deterministic fake embedder vs the oracle (spec: tests/fixtures/oracle/README.md).
 */
import { describe, expect, it } from "vitest";
import { fakeEmbed } from "../../src/intel/fakeEmbedder";
import { argTopK, cosine, dot, norm } from "../../src/intel/vectors";
import corpusJson from "../fixtures/oracle/corpus.json";
import knnJson from "../fixtures/oracle/knn.json";

interface OracleKnn {
	params: { embed_prefix: string };
	queries: {
		query_id: string;
		full_sims?: { id: string; label: string; sim: number }[];
		query_vector?: number[];
	}[];
}
interface OracleCorpus {
	emails: { id: string; text: string }[];
}

const knn = knnJson as OracleKnn;
const corpus = corpusJson as OracleCorpus;

const textById = new Map(corpus.emails.map((e) => [e.id, e.text]));
const q0 = knn.queries[0];

describe("fakeEmbed parity", () => {
	it("reproduces the oracle query vector bit-for-bit (1e-9)", () => {
		const text = textById.get(q0.query_id);
		if (text === undefined || q0.query_vector === undefined)
			throw new Error("oracle missing q0 data");
		const vec = fakeEmbed(knn.params.embed_prefix + text);
		expect(vec).toHaveLength(q0.query_vector.length);
		for (let d = 0; d < vec.length; d++) {
			expect(
				Math.abs(vec[d] - q0.query_vector[d]),
				`dim ${d}`,
			).toBeLessThanOrEqual(1e-9);
		}
	});

	it("zero vector stays zero (no tokens)", () => {
		expect(fakeEmbed("!!! ???")).toEqual(new Array(64).fill(0));
	});
});

describe("cosine parity", () => {
	it("reproduces the oracle full similarity list for query 0 (1e-9)", () => {
		if (!q0.full_sims || !q0.query_vector)
			throw new Error("oracle missing q0 sims");
		for (const row of q0.full_sims) {
			const text = textById.get(row.id);
			if (text === undefined) throw new Error(`missing corpus text ${row.id}`);
			const sim = cosine(
				q0.query_vector,
				fakeEmbed(knn.params.embed_prefix + text),
			);
			expect(Math.abs(sim - row.sim), row.id).toBeLessThanOrEqual(1e-9);
		}
	});
});

describe("vector math units", () => {
	it("dot and norm", () => {
		expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
		expect(norm([3, 4])).toBe(5);
	});
	it("cosine zero-guard returns 0 (mirrors the oracle script)", () => {
		expect(cosine([0, 0], [1, 1])).toBe(0);
	});
	it("argTopK is descending and stable on ties", () => {
		expect(argTopK([0.1, 0.9, 0.5, 0.9], 3)).toEqual([1, 3, 2]);
	});
});
