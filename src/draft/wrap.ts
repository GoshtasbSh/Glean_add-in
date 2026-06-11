/**
 * Deterministic micro-voice assembly — design doc §1-MICRO (the layer the
 * LLM is NEVER trusted with). Code assembles
 * `[greeting]\n\n[LLM body]\n\n[sign-off]` from the relationship card:
 * frequency x recency selection, thread-position habit, cold-start formal
 * defaults. Pure functions; `now` is a parameter so tests are deterministic.
 *
 * Relationship card schema stub (full zod schema + persistence land in A3
 * with relationships.json — design doc §3.1).
 */

export interface LexiconEntry {
	text: string;
	count: number;
	lastUsed: string; // ISO timestamp
}

export interface RelationshipCard {
	address: string;
	displayName: string;
	greetings: LexiconEntry[];
	closings: LexiconEntry[];
	threadGreetingHabit?: { start: "greet" | "none"; mid: "greet" | "none" };
	registerHist?: Record<string, number>;
	clusterHist?: Record<string, number>;
}

export type ThreadPosition = "start" | "mid";

// Recency half-life: a form unused for ~6 months loses half its weight, so a
// recent switch ("Hi Sarah," after years of "Dear Prof Smith,") wins quickly.
const HALF_LIFE_DAYS = 180;
const MS_PER_DAY = 86_400_000;

function recencyWeight(lastUsed: string, now: Date): number {
	const ageDays = Math.max(
		0,
		(now.getTime() - new Date(lastUsed).getTime()) / MS_PER_DAY,
	);
	return 2 ** (-ageDays / HALF_LIFE_DAYS);
}

/** Highest count x recency entry; ties keep lexicon order. Empty -> "". */
function selectLexicon(entries: readonly LexiconEntry[], now: Date): string {
	let best = "";
	let bestScore = -1;
	for (const e of entries) {
		const score = e.count * recencyWeight(e.lastUsed, now);
		if (score > bestScore) {
			bestScore = score;
			best = e.text;
		}
	}
	return best;
}

/** Cold-start greeting: `Dear <name as in From-header>,` (formal default). */
export function coldStartGreeting(fromDisplayName: string): string {
	const name = fromDisplayName.trim();
	if (!name) return "Dear Sir/Madam,";
	return `Dear ${name},`;
}

// Formality ranking for sign-off keywords (extractor.py _FORMAL_SIGNOFF).
const SIGNOFF_FORMALITY: [RegExp, number][] = [
	[/\bsincerely\b/i, 1.0],
	[/\bkind regards\b/i, 0.95],
	[/\bbest regards\b/i, 0.9],
	[/\bwarm regards\b/i, 0.85],
	[/\bregards\b/i, 0.9],
	[/\bthank you\b/i, 0.7],
	[/\bbest\b/i, 0.5],
	[/\bthanks\b/i, 0.5],
	[/\bcheers\b/i, 0.1],
];

function signoffFormality(text: string): number {
	for (const [re, score] of SIGNOFF_FORMALITY) {
		if (re.test(text)) return score;
	}
	return 0.5;
}

/** Cold-start sign-off: the user's most FORMAL learned sign-off, else full name. */
export function coldStartSignoff(
	userSignoffs: readonly LexiconEntry[],
	userFullName: string,
): string {
	let best = "";
	let bestScore = -1;
	for (const e of userSignoffs) {
		const score = signoffFormality(e.text);
		if (score > bestScore) {
			bestScore = score;
			best = e.text;
		}
	}
	return best || `Best regards,\n${userFullName}`;
}

/**
 * Greeting for this draft. Thread-position aware (per-person habit; default
 * mid-thread = none). Card with an empty lexicon falls back to the cold-start
 * formal default built from the card's display name.
 */
export function selectGreeting(
	card: RelationshipCard,
	position: ThreadPosition,
	now: Date,
): string {
	const habit = card.threadGreetingHabit ?? {
		start: "greet" as const,
		mid: "none" as const,
	};
	if ((position === "start" ? habit.start : habit.mid) === "none") return "";
	return (
		selectLexicon(card.greetings, now) || coldStartGreeting(card.displayName)
	);
}

/** Sign-off for this draft (frequency x recency). Empty lexicon -> "". */
export function selectClosing(card: RelationshipCard, now: Date): string {
	return selectLexicon(card.closings, now);
}

/** `[greeting]\n\n[body]\n\n[sign-off]`, omitting empty parts cleanly. */
export function wrapDraft(
	body: string,
	greeting: string,
	signoff: string,
): string {
	return [greeting, body.trim(), signoff]
		.filter((part) => part.length > 0)
		.join("\n\n");
}
