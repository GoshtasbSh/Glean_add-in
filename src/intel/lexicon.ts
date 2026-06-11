/**
 * Deterministic greeting/closing extraction — SESSION A3 §3.2b
 * (design doc §3.1). Regex over the user's OWN sent mail; this is the
 * MICRO-voice ground truth, so the extracted text is kept EXACTLY as written
 * (punctuation included — "Dear Dr Von Meding," must round-trip verbatim).
 */

export interface ExtractedGreeting {
	/** The greeting line exactly as written (trimmed). */
	text: string;
	/** Greeting keyword, lowercased; "bare" for a bare-name greeting. */
	word: string;
	/** Captured name form ("Dr Von Meding"), null when none. */
	nameForm: string | null;
}

const GREETING_WORD_RE =
	/^(Good morning|Good afternoon|Hello|Dear|Hi|Hey)\b[ ,]*(.*?)[,;:]?\s*$/i;

// Bare-name greeting: 1-3 capitalized words ending with a comma ("Jason,").
const BARE_NAME_RE = /^([A-Z][\w.'’-]*(?: [A-Z][\w.'’-]*){0,2}),$/u;

function firstNonEmptyLine(body: string): string | null {
	for (const line of body.split("\n")) {
		const t = line.trim();
		if (t.length > 0) return t;
	}
	return null;
}

export function extractGreeting(bodyClean: string): ExtractedGreeting | null {
	const line = firstNonEmptyLine(bodyClean);
	if (line === null) return null;

	const m = GREETING_WORD_RE.exec(line);
	if (m) {
		const name = m[2].trim();
		return {
			text: line,
			word: m[1].toLowerCase(),
			nameForm: name.length > 0 ? name : null,
		};
	}
	const bare = BARE_NAME_RE.exec(line);
	if (bare) {
		return { text: line, word: "bare", nameForm: bare[1] };
	}
	return null;
}

// Closing keyword line ("Best regards," / "Thanks," / "Cheers!"). Anchored to
// a whole line so "Thanks to your fix…" mid-sentence never matches.
const CLOSING_LINE_RE =
	/^(Best regards|Kind regards|Warm regards|Warm wishes|Best wishes|Many thanks|Thank you|Thanks|Best|Regards|Cheers|Sincerely|Respectfully|Take care)[,!.]?\s*$/i;

// A plausible self-name line under the closing: short, no sentence punctuation.
const NAME_LINE_RE = /^[\w.'’-]+(?: [\w.'’-]+){0,3}$/u;

/**
 * The closing block (keyword line + optional self-name line(s)), exactly as
 * written, or null. Looks at the LAST lines only — the signature separator
 * was already stripped upstream (strip.ts).
 */
export function extractClosing(bodyClean: string): string | null {
	const lines = bodyClean
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) return null;

	// The closing keyword sits on one of the last 3 lines (keyword + up to 2 name lines).
	const start = Math.max(0, lines.length - 3);
	for (let i = start; i < lines.length; i++) {
		if (CLOSING_LINE_RE.test(lines[i])) {
			const block = [lines[i]];
			for (let j = i + 1; j < lines.length; j++) {
				if (!NAME_LINE_RE.test(lines[j])) return null; // trailing prose — not a closing
				block.push(lines[j]);
			}
			return block.join("\n");
		}
	}
	return null;
}

/**
 * Greeting-formality scalar (extended feature §1-MESO + tier heuristic input).
 * Anchored to extractor.py _FORMAL_GREETING; "bare" slots between hi and hey.
 */
const GREETING_FORMALITY: Record<string, number> = {
	dear: 1.0,
	"good morning": 0.9,
	"good afternoon": 0.9,
	hello: 0.6,
	hi: 0.5,
	bare: 0.3,
	hey: 0.0,
};

export function classifyGreetingFormality(word: string | null): number {
	if (word === null) return 0.5;
	return GREETING_FORMALITY[word.toLowerCase()] ?? 0.5;
}
