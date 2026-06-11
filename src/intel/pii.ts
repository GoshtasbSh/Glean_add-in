/**
 * Exemplar PII filter — port of backend/src/glean/voice/pii_filter.py
 * (HARDENING §2.1), pattern-for-pattern. Emails matching any pattern are
 * excluded from the voice corpus + exemplar pool (their text would otherwise
 * seed future drafter prompts).
 */

const PII_PATTERNS: RegExp[] = [
	/\b\d{3}-\d{2}-\d{4}\b/, // SSN
	/\b\d{16}\b/, // credit card
	/verification code is \d{4,8}/i,
	/one-?time (code|password|passcode)/i,
	/\b[A-Z0-9]{8,}\b.*(token|secret|key)/i,
	/password.{0,20}:.{0,40}/i,
	/\bUFID[:\s]*\d{4}-?\d{4}\b/i, // UF student ID (widened sep vs doc)
	// 8-digit id — REQUIRE an id cue word so dates/invoice numbers don't
	// false-positive and wrongly exclude a real email from the corpus.
	/\b(?:UFID|UF\s*ID|student\s*(?:id|number|no|#)|gator\s*id|empl?\s*id)\b[:#\s]*\d{8}\b/i,
	/@students?\.ufl\.edu/,
];

/** True if `text` matches any PII pattern. Empty → false. */
export function contains_pii(text: string): boolean {
	if (!text) return false;
	return PII_PATTERNS.some((p) => p.test(text));
}
