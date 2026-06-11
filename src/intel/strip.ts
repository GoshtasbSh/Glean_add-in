/**
 * Signature + reply-quote stripping for ANALYSIS text — port of
 * backend/src/glean/gmail/parser.py:515-538 (_strip_signature,
 * _strip_reply_quotes, _clean_body), extended with two Outlook reply markers
 * the Gmail parser never saw:
 *   - the "________________________________" divider line
 *   - a bare "From: …" header block immediately followed by "Sent:"/"Date:"
 * Strip rules only — the Gmail plumbing is NOT ported (plan §0).
 */

// parser.py:516 — "On <date> <name> wrote:" RFC reply sentinel (single line).
const WROTE_RE = /^On .+ wrote:\s*$/m;

// Outlook quoted-original divider (observed 32+ underscores; accept >=10).
const OUTLOOK_DIVIDER_RE = /^_{10,}\s*$/m;

/** parser.py:519-525 — truncate at the standard sig separator ('--'/'-- '). */
export function stripSignature(text: string): string {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const stripped = lines[i].replace(/\s+$/, "");
		if (stripped === "--") {
			return lines.slice(0, i).join("\n").trim();
		}
	}
	return text.trim();
}

/** True if lines[i] opens an Outlook reply-header block (From: then Sent:/Date:). */
function isOutlookHeaderStart(lines: readonly string[], i: number): boolean {
	if (!/^From:\s?.+/.test(lines[i])) return false;
	for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
		if (/^(Sent|Date):\s?/.test(lines[j])) return true;
	}
	return false;
}

/** parser.py:528-534 + Outlook markers — remove quoted-original blocks. */
export function stripReplyQuotes(text: string): string {
	let t = text;
	const wrote = WROTE_RE.exec(t);
	if (wrote) t = t.slice(0, wrote.index).trim();
	const divider = OUTLOOK_DIVIDER_RE.exec(t);
	if (divider) t = t.slice(0, divider.index).trim();

	const lines = t.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (isOutlookHeaderStart(lines, i)) {
			return lines
				.slice(0, i)
				.filter((ln) => !ln.startsWith(">"))
				.join("\n")
				.trim();
		}
	}
	return lines
		.filter((ln) => !ln.startsWith(">"))
		.join("\n")
		.trim();
}

/** parser.py:537-538 — signature strip first, then quote strip. */
export function cleanBody(bodyText: string): string {
	return stripReplyQuotes(stripSignature(bodyText));
}
