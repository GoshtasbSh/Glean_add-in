/**
 * ladder.ts — tiered exemplar selection T1 (this person) -> T2 (dominant
 * cluster) -> T3 (register) -> T4 (neutral formal), 3-4 total, tier labels
 * carried into the prompt (design doc §2). One test per fallback path.
 */
import { describe, expect, it } from "vitest";
import {
	type ExemplarPools,
	selectExemplars,
	T4_NEUTRAL_FORMAL,
} from "../src/intel/ladder";

function ex(body: string): { body: string } {
	return { body };
}

describe("selectExemplars", () => {
	it("rich T1 history: takes up to 4 from T1 alone", () => {
		const pools: ExemplarPools = {
			t1: [ex("a"), ex("b"), ex("c"), ex("d"), ex("e")],
			t2: [ex("x")],
			t3: [ex("y")],
		};
		const out = selectExemplars(pools);
		expect(out).toHaveLength(4);
		expect(out.every((e) => e.tier === "T1")).toBe(true);
		expect(out.map((e) => e.body)).toEqual(["a", "b", "c", "d"]);
	});

	it("partial T1 fills from T2 then T3", () => {
		const pools: ExemplarPools = {
			t1: [ex("a")],
			t2: [ex("x"), ex("y")],
			t3: [ex("z")],
		};
		const out = selectExemplars(pools);
		expect(out.map((e) => [e.tier, e.body])).toEqual([
			["T1", "a"],
			["T2", "x"],
			["T2", "y"],
			["T3", "z"],
		]);
	});

	it("zero history: T4 neutral formal default only, still >= 1 exemplar", () => {
		const out = selectExemplars({ t1: [], t2: [], t3: [] });
		expect(out).toHaveLength(1);
		expect(out[0].tier).toBe("T4");
		expect(out[0].body).toBe(T4_NEUTRAL_FORMAL);
	});

	it("T4 tops up to the minimum of 3 when sparse", () => {
		const out = selectExemplars({ t1: [ex("a")], t2: [ex("x")], t3: [] });
		expect(out.map((e) => e.tier)).toEqual(["T1", "T2", "T4"]);
	});

	it("dedupes identical bodies across tiers", () => {
		const out = selectExemplars({
			t1: [ex("same")],
			t2: [ex("same"), ex("x")],
			t3: [ex("y")],
		});
		expect(out.map((e) => [e.tier, e.body])).toEqual([
			["T1", "same"],
			["T2", "x"],
			["T3", "y"],
		]);
	});
});
