/**
 * SESSION A3 §3.2 — signature/quote strip, ported from
 * backend/src/glean/gmail/parser.py:515-538 (_strip_signature,
 * _strip_reply_quotes, _clean_body) + 3 Outlook-style additions
 * (divider line, From:/Sent: header block).
 */
import { describe, expect, it } from "vitest";
import {
	cleanBody,
	stripReplyQuotes,
	stripSignature,
} from "../src/intel/strip";

describe("stripSignature (parser.py:519-525)", () => {
	it("truncates at the standard '--' separator", () => {
		expect(
			stripSignature(
				"Thanks for the update.\n--\nGoshtasb Shahriari\nPhD Student",
			),
		).toBe("Thanks for the update.");
	});

	it("accepts the '-- ' (trailing space) variant", () => {
		expect(stripSignature("Body text.\n-- \nSig block")).toBe("Body text.");
	});

	it("does NOT cut on a '---' divider (only exact -- / -- )", () => {
		const text = "Para one.\n---\nPara two.";
		expect(stripSignature(text)).toBe(text);
	});

	it("returns trimmed text when no separator exists", () => {
		expect(stripSignature("  Hello.  \n")).toBe("Hello.");
	});
});

describe("stripReplyQuotes (parser.py:528-534)", () => {
	it("cuts at the 'On <date> <name> wrote:' sentinel", () => {
		const text =
			"My reply here.\n\nOn Tue, Jun 10, 2026 at 9:00 AM Sarah Mitchell wrote:\n> old text";
		expect(stripReplyQuotes(text)).toBe("My reply here.");
	});

	it("drops '>'-quoted lines", () => {
		expect(
			stripReplyQuotes(
				"New line.\n> quoted one\n> quoted two\nAnother new line.",
			),
		).toBe("New line.\nAnother new line.");
	});
});

describe("cleanBody — Outlook-style fixtures (new in A3)", () => {
	it("cuts at the Outlook underscore divider", () => {
		const text =
			"I'll send the revised plots tomorrow.\n\n________________________________\nFrom: Sarah Mitchell <s.mitchell@ufl.edu>\nSent: Tuesday, June 10, 2026 9:00 AM\nTo: Goshtasb\nSubject: Re: plots";
		expect(cleanBody(text)).toBe("I'll send the revised plots tomorrow.");
	});

	it("cuts at a bare From:/Sent: reply header block (no divider)", () => {
		const text =
			"Sounds good, see you then.\n\nFrom: Jason Von Meding <j.vonmeding@ufl.edu>\nSent: Monday, June 9, 2026 4:12 PM\nTo: Goshtasb Shahriari\nSubject: meeting";
		expect(cleanBody(text)).toBe("Sounds good, see you then.");
	});

	it("does NOT cut on a body sentence that merely starts with 'From:'-like text", () => {
		// "From:" line WITHOUT a following Sent:/Date: line is kept (not a header).
		const text = "From: my perspective this is fine.\nLet me know.";
		expect(cleanBody(text)).toBe(text);
	});

	it("applies signature strip before quote strip (parser.py _clean_body order)", () => {
		const text =
			"Quick answer.\n--\nGoshtasb\n\nOn Mon, Jun 9, 2026 Jason wrote:\n> original question";
		expect(cleanBody(text)).toBe("Quick answer.");
	});

	it("keeps the original text intact for a plain message", () => {
		const text =
			"Dear Dr Von Meding,\n\nThe sampling run finished overnight.\n\nBest regards,\nGoshtasb";
		expect(cleanBody(text)).toBe(text);
	});
});
