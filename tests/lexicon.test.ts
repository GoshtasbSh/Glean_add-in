/**
 * SESSION A3 §3.2b — deterministic greeting/closing lexicon extraction
 * (design doc §3.1: regex over the user's own sent mail; the layer that makes
 * "Dear Dr Von Meding," self-correct without any LLM).
 */
import { describe, expect, it } from "vitest";
import {
	classifyGreetingFormality,
	extractClosing,
	extractGreeting,
} from "../src/intel/lexicon";

describe("extractGreeting", () => {
	it("extracts the advisor greeting EXACTLY, comma included (DoD case)", () => {
		const body =
			"Dear Dr Von Meding,\n\nThank you for the feedback on the chapter.\n\nBest regards,\nGoshtasb";
		expect(extractGreeting(body)).toEqual({
			text: "Dear Dr Von Meding,",
			word: "dear",
			nameForm: "Dr Von Meding",
		});
	});

	const variants: [string, string, string | null, string][] = [
		// [first line, expected word, expected nameForm, label]
		["Hi Sarah,", "hi", "Sarah", "hi + first name"],
		[
			"Hello Professor Mitchell,",
			"hello",
			"Professor Mitchell",
			"hello + title",
		],
		["Hey J,", "hey", "J", "hey + initial"],
		[
			"Good morning Dr. Smith,",
			"good morning",
			"Dr. Smith",
			"good morning + dotted title",
		],
		["Good afternoon all,", "good afternoon", "all", "good afternoon + group"],
		["Dear Selection Committee,", "dear", "Selection Committee", "dear + role"],
		["Hi everyone,", "hi", "everyone", "hi + group"],
		["Hello,", "hello", null, "hello with no name"],
		["Dear Dr Von Meding:", "dear", "Dr Von Meding", "colon variant"],
		["Hi Sarah", "hi", "Sarah", "no trailing punctuation"],
	];
	for (const [line, word, nameForm, label] of variants) {
		it(`extracts: ${label}`, () => {
			const g = extractGreeting(`${line}\nFirst real sentence here.`);
			expect(g?.text).toBe(line);
			expect(g?.word).toBe(word);
			expect(g?.nameForm ?? null).toBe(nameForm);
		});
	}

	it("extracts a bare-name greeting", () => {
		expect(
			extractGreeting("Jason,\n\nQuick question about the rubric."),
		).toEqual({
			text: "Jason,",
			word: "bare",
			nameForm: "Jason",
		});
	});

	it("returns null for a mid-thread reply that starts with a sentence", () => {
		expect(
			extractGreeting("Sounds good — I'll push the fix tonight."),
		).toBeNull();
	});

	it("does not treat a long opening sentence ending in a comma as a bare name", () => {
		expect(
			extractGreeting(
				"Following up on our discussion from Tuesday,\nhere are the plots.",
			),
		).toBeNull();
	});

	it("skips leading blank lines", () => {
		expect(extractGreeting("\n\nDear Sarah,\nbody")?.text).toBe("Dear Sarah,");
	});
});

describe("extractClosing", () => {
	it("extracts the closing block with the self-name form", () => {
		const body = "Thanks for the review.\n\nBest regards,\nGoshtasb";
		expect(extractClosing(body)).toBe("Best regards,\nGoshtasb");
	});

	it("extracts a short informal closing", () => {
		expect(extractClosing("See you there.\n\nThanks,\nG")).toBe("Thanks,\nG");
	});

	it("extracts a closing with no name line", () => {
		expect(extractClosing("Got it, will do.\n\nCheers!")).toBe("Cheers!");
	});

	it("returns null when there is no closing", () => {
		expect(extractClosing("Can you resend the file?")).toBeNull();
	});

	it("does not swallow a body sentence containing 'thanks' mid-text", () => {
		expect(
			extractClosing("Thanks to your fix the build passes now. More tomorrow."),
		).toBeNull();
	});

	it("keeps a two-line name block (full name)", () => {
		expect(
			extractClosing("Draft attached.\n\nSincerely,\nGoshtasb Shahriari"),
		).toBe("Sincerely,\nGoshtasb Shahriari");
	});
});

describe("classifyGreetingFormality (extended feature input)", () => {
	it("ranks dear > hello > hi > hey", () => {
		const dear = classifyGreetingFormality("dear");
		const hello = classifyGreetingFormality("hello");
		const hi = classifyGreetingFormality("hi");
		const hey = classifyGreetingFormality("hey");
		expect(dear).toBeGreaterThan(hello);
		expect(hello).toBeGreaterThan(hi);
		expect(hi).toBeGreaterThan(hey);
	});

	it("returns the neutral default 0.5 for no greeting", () => {
		expect(classifyGreetingFormality(null)).toBe(0.5);
	});

	it("scores a bare-name greeting between hi and hey", () => {
		const bare = classifyGreetingFormality("bare");
		expect(bare).toBeLessThan(classifyGreetingFormality("hi"));
		expect(bare).toBeGreaterThan(classifyGreetingFormality("hey"));
	});
});
