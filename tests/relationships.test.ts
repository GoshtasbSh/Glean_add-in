/**
 * SESSION A3 §3.2b — relationship card helpers (design doc §3.1): cold-card
 * creation, lexicon increments with recency, histograms, tier heuristic,
 * thread-greeting habit resolution.
 */
import { describe, expect, it } from "vitest";
import {
	addLexiconEntry,
	bumpHist,
	createColdCard,
	recipientTierHeuristic,
	resolveThreadHabit,
} from "../src/intel/relationships";

describe("recipientTierHeuristic", () => {
	it("classifies a titled ufl.edu correspondent as faculty", () => {
		expect(
			recipientTierHeuristic("j.vonmeding@ufl.edu", "Dr. Jason Von Meding"),
		).toBe("faculty");
		expect(recipientTierHeuristic("smith@ufl.edu", "Prof. Ada Smith")).toBe(
			"faculty",
		);
	});

	it("classifies a plain ufl.edu correspondent as peer", () => {
		expect(recipientTierHeuristic("s.mitchell@ufl.edu", "Sarah Mitchell")).toBe(
			"peer",
		);
	});

	it("classifies non-UF domains as external", () => {
		expect(recipientTierHeuristic("editor@journal.org", "The Editor")).toBe(
			"external",
		);
	});
});

describe("createColdCard", () => {
	it("builds a schema-valid card with formal defaults", () => {
		const card = createColdCard("x@ufl.edu", "Xavier Yu");
		expect(card.address).toBe("x@ufl.edu");
		expect(card.displayName).toBe("Xavier Yu");
		expect(card.tier).toBe("peer");
		expect(card.greetings).toEqual([]);
		expect(card.threadGreetingHabit).toEqual({ start: "greet", mid: "none" });
		expect(card.exemplarTierWeights).toEqual({ T1: 1.0, T2: 1.0, T3: 1.0 });
		expect(card.sampleCount).toBe(0);
	});
});

describe("addLexiconEntry", () => {
	it("appends a new form", () => {
		const entries = addLexiconEntry(
			[],
			"Dear Dr Von Meding,",
			"2026-06-01T00:00:00Z",
		);
		expect(entries).toEqual([
			{
				text: "Dear Dr Von Meding,",
				count: 1,
				lastUsed: "2026-06-01T00:00:00Z",
			},
		]);
	});

	it("increments an existing form and advances lastUsed forward only", () => {
		let entries = addLexiconEntry([], "Hi Sarah,", "2026-06-05T00:00:00Z");
		entries = addLexiconEntry(entries, "Hi Sarah,", "2026-06-01T00:00:00Z"); // older
		expect(entries).toEqual([
			{ text: "Hi Sarah,", count: 2, lastUsed: "2026-06-05T00:00:00Z" },
		]);
		entries = addLexiconEntry(entries, "Hi Sarah,", "2026-06-09T00:00:00Z"); // newer
		expect(entries[0].lastUsed).toBe("2026-06-09T00:00:00Z");
	});
});

describe("bumpHist", () => {
	it("increments and creates keys", () => {
		const hist: Record<string, number> = { formal: 2 };
		bumpHist(hist, "formal");
		bumpHist(hist, "casual");
		expect(hist).toEqual({ formal: 3, casual: 1 });
	});
});

describe("resolveThreadHabit", () => {
	it("majority greet on start, none mid (the common shape)", () => {
		expect(
			resolveThreadHabit({
				startGreet: 9,
				startNone: 1,
				midGreet: 2,
				midNone: 8,
			}),
		).toEqual({ start: "greet", mid: "none" });
	});

	it("defaults to start=greet mid=none with zero observations", () => {
		expect(
			resolveThreadHabit({
				startGreet: 0,
				startNone: 0,
				midGreet: 0,
				midNone: 0,
			}),
		).toEqual({
			start: "greet",
			mid: "none",
		});
	});

	it("keeps the formal default on EXACT non-zero ties (policy pin)", () => {
		expect(
			resolveThreadHabit({
				startGreet: 3,
				startNone: 3,
				midGreet: 3,
				midNone: 3,
			}),
		).toEqual({ start: "greet", mid: "none" });
	});

	it("flips mid to greet when the user always greets mid-thread", () => {
		expect(
			resolveThreadHabit({
				startGreet: 5,
				startNone: 0,
				midGreet: 7,
				midNone: 1,
			}),
		).toEqual({ start: "greet", mid: "greet" });
	});
});
