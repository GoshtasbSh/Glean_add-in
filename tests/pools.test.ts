/**
 * SESSION A3 §3.6 wiring — build the A2 ladder's exemplar pools from the REAL
 * profile.json (T1 person → T2 dominant cluster → T3 register, formality-
 * proximity tie-break ported from commit 0290e7b) + the §4 voice-synthesis line.
 */
import { describe, expect, it } from "vitest";
import { buildExemplarPools, voiceSynthesisLine } from "../src/intel/pools";
import type { Exemplar, StyleCluster } from "../src/store/schemas";

const HASH_A = "hash-advisor";
const HASH_B = "hash-other";

let nextId = 0;
function ex(over: Partial<Exemplar>): Exemplar {
	nextId += 1;
	return {
		recipientHash: HASH_B,
		register: "formal",
		styleVector: [0.8],
		text: "default text",
		sourceMsgId: `m${nextId}`, // unique, like real message ids
		sentAt: "2026-05-01T00:00:00Z",
		cluster: 0,
		...over,
	};
}

describe("buildExemplarPools", () => {
	const exemplars: Exemplar[] = [
		ex({
			recipientHash: HASH_A,
			text: "to advisor old",
			sentAt: "2026-04-01T00:00:00Z",
		}),
		ex({
			recipientHash: HASH_A,
			text: "to advisor new",
			sentAt: "2026-06-01T00:00:00Z",
		}),
		ex({
			recipientHash: HASH_B,
			cluster: 2,
			text: "cluster2 sample",
			styleVector: [0.9],
		}),
		ex({
			recipientHash: HASH_B,
			cluster: 0,
			register: "formal",
			text: "formal sample",
			styleVector: [0.7],
		}),
		ex({
			recipientHash: HASH_B,
			cluster: 0,
			register: "casual",
			text: "casual sample",
			styleVector: [0.2],
		}),
	];

	it("T1 = this person's exemplars, newest first; no duplicates in T2/T3", () => {
		const pools = buildExemplarPools(exemplars, HASH_A, "formal", {
			"2": 5,
			"0": 1,
		});
		expect(pools.t1.map((e) => e.body)).toEqual([
			"to advisor new",
			"to advisor old",
		]);
		expect(pools.t2.map((e) => e.body)).toEqual(["cluster2 sample"]); // dominant cluster 2
		expect(pools.t3.map((e) => e.body)).toContain("formal sample");
		expect(pools.t3.map((e) => e.body)).not.toContain("cluster2 sample");
	});

	it("cold card (no cluster hist) → empty T2, register-based T3", () => {
		const pools = buildExemplarPools(
			exemplars,
			"hash-nobody",
			"casual",
			undefined,
		);
		expect(pools.t1).toEqual([]);
		expect(pools.t2).toEqual([]);
		expect(pools.t3.map((e) => e.body)).toEqual(["casual sample"]);
	});

	it("ties in T3 prefer formality proximity to the target register (0290e7b)", () => {
		const sameDay: Exemplar[] = [
			ex({
				register: "formal",
				styleVector: [0.95],
				text: "very formal",
				sentAt: "2026-05-01T00:00:00Z",
			}),
			ex({
				register: "formal",
				styleVector: [0.8],
				text: "target formal",
				sentAt: "2026-05-01T00:00:00Z",
			}),
		];
		const pools = buildExemplarPools(sameDay, "none", "formal", undefined);
		// target for "formal" is 0.8 -> the 0.8 exemplar ranks first
		expect(pools.t3[0].body).toBe("target formal");
	});
});

describe("voiceSynthesisLine (design doc §4)", () => {
	const cluster: StyleCluster = {
		id: 0,
		name: "Formal–faculty",
		centroid: [],
		size: 30,
		params: {
			avg_sentence_len: 18.4,
			contraction_rate: 0.01,
			politeness_rate: 0.04,
			exclamation_rate: 0.0,
		},
		evidence: {
			topTiers: [],
			avgWords: 120,
			contractionRate: 0.01,
			sampleOpenings: [],
		},
	};

	it("renders the human-readable synthesis line", () => {
		const line = voiceSynthesisLine(cluster);
		expect(line).toContain("average sentence length ~18 words");
		expect(line).toContain("contractions: rare");
		expect(line).toContain("politeness markers: frequent");
	});

	it("returns empty string when params are missing", () => {
		expect(voiceSynthesisLine({ ...cluster, params: {} })).toBe("");
	});
});
