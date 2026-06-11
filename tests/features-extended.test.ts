/**
 * SESSION A3 §3.3 — extended stylometric features (design doc §1-MESO
 * micro-markers), APPENDED AFTER the legacy 9 so A2 parity stays intact.
 */
import { describe, expect, it } from "vitest";
import {
	EXTENDED_FEATURE_NAMES,
	extendedFeatureVector,
	FEATURE_NAMES,
	styleFeatureVector,
} from "../src/intel/features";
import { contains_pii } from "../src/intel/pii";

const FORMAL =
	"Dear Dr Von Meding,\n\nThank you for the detailed feedback on the chapter. I have revised the methodology section accordingly and would appreciate your thoughts on the new framing. Could you please let me know if the timeline still works?\n\nBest regards,\nGoshtasb";
const CASUAL = "hey! quick q - can't make it today, push to thurs? thx!!";

describe("extendedFeatureVector", () => {
	it("keeps the legacy 9 dims EXACTLY (parity guard)", () => {
		for (const text of [FORMAL, CASUAL, ""]) {
			expect(
				extendedFeatureVector(text).slice(0, FEATURE_NAMES.length),
			).toEqual(styleFeatureVector(text));
		}
	});

	it("has one value per extended feature name", () => {
		expect(extendedFeatureVector(FORMAL)).toHaveLength(
			EXTENDED_FEATURE_NAMES.length,
		);
		expect(EXTENDED_FEATURE_NAMES.slice(0, FEATURE_NAMES.length)).toEqual([
			...FEATURE_NAMES,
		]);
	});

	it("scores politeness markers higher in the formal sample", () => {
		const i = EXTENDED_FEATURE_NAMES.indexOf("politeness_rate");
		expect(extendedFeatureVector(FORMAL)[i]).toBeGreaterThan(
			extendedFeatureVector(CASUAL)[i],
		);
	});

	it("computes sentence-length variance 0 for uniform sentences", () => {
		const i = EXTENDED_FEATURE_NAMES.indexOf("sentence_len_variance");
		expect(
			extendedFeatureVector("One two three. Four five six. Seven eight nine.")[
				i
			],
		).toBe(0);
		expect(
			extendedFeatureVector(
				"Short. This sentence is considerably longer than that one.",
			)[i],
		).toBeGreaterThan(0);
	});

	it("gives simple text a higher Flesch score than dense text", () => {
		const i = EXTENDED_FEATURE_NAMES.indexOf("flesch");
		const simple = extendedFeatureVector(
			"The cat sat. The dog ran. We had fun.",
		)[i];
		const dense = extendedFeatureVector(
			"Notwithstanding institutional heterogeneity, comprehensive organizational evaluation necessitates multidimensional infrastructural recalibration.",
		)[i];
		expect(simple).toBeGreaterThan(dense);
	});

	it("encodes greeting formality (dear=1, none=0.5, hey=0)", () => {
		const i = EXTENDED_FEATURE_NAMES.indexOf("greeting_formality");
		expect(extendedFeatureVector("Dear Sarah,\nbody here.")[i]).toBe(1.0);
		expect(extendedFeatureVector("No greeting sentence here.")[i]).toBe(0.5);
		expect(extendedFeatureVector("Hey Sam,\nbody here.")[i]).toBe(0.0);
	});

	it("computes average paragraph length in words", () => {
		const i = EXTENDED_FEATURE_NAMES.indexOf("avg_paragraph_len");
		// Two paragraphs: 4 words and 2 words -> 3.
		expect(extendedFeatureVector("one two three four\n\nfive six")[i]).toBe(3);
	});

	it("returns finite values on empty/degenerate input", () => {
		for (const v of extendedFeatureVector(""))
			expect(Number.isFinite(v)).toBe(true);
	});
});

describe("contains_pii (port of voice/pii_filter.py)", () => {
	it("flags SSN, card, codes, UFID, student domain", () => {
		expect(contains_pii("my ssn is 123-45-6789")).toBe(true);
		expect(contains_pii("card 4111111111111111 thanks")).toBe(true);
		expect(contains_pii("Your verification code is 482910")).toBe(true);
		expect(contains_pii("use this one-time passcode now")).toBe(true);
		expect(contains_pii("UFID: 1234-5678")).toBe(true);
		expect(contains_pii("student id: 12345678")).toBe(true);
		expect(contains_pii("mail me at gator@students.ufl.edu")).toBe(true);
	});

	it("does NOT flag dates or invoice numbers (8 digits without cue)", () => {
		expect(contains_pii("the deadline 20260609 works")).toBe(false);
		expect(contains_pii("Invoice 10023847 is attached")).toBe(false);
		expect(contains_pii("")).toBe(false);
	});
});
