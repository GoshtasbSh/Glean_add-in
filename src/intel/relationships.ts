/**
 * Relationship card helpers — SESSION A3 §3.2b (design doc §3.1).
 * Pure functions over the RelationshipCardV1 shape; onboarding/catch-up own
 * the read-modify-write cycle against relationships.json.
 */
import type { LexiconEntryT, RelationshipCardT, Tier } from "../store/schemas";

/** SHA-256 hex of the lowercased address — the recipientHash key everywhere. */
export async function hashAddress(address: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(address.trim().toLowerCase()),
	);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Tier heuristic (design doc §2): domain + display-name title. UF domain with
 * an academic title -> faculty; UF otherwise -> peer; anything else ->
 * external. ("student" is never guessed — user-overridable on the card.)
 */
export function recipientTierHeuristic(
	address: string,
	displayName: string,
): Tier {
	const domain = address.toLowerCase().split("@")[1] ?? "";
	const isUf = domain === "ufl.edu" || domain.endsWith(".ufl.edu");
	if (!isUf) return "external";
	if (/\b(dr|prof|professor)\b\.?/i.test(displayName)) return "faculty";
	return "peer";
}

/**
 * Second tier signal (design doc §2: "domain + observed register"): a UF
 * correspondent the user consistently writes to FORMALLY is faculty even
 * without a title in the display name. Title-based faculty is never demoted.
 */
export function refineTierFromRegister(card: RelationshipCardT): Tier {
	if (card.tier !== "peer") return card.tier;
	const formal = card.registerHist.formal ?? 0;
	const total = Object.values(card.registerHist).reduce((a, b) => a + b, 0);
	if (total >= 3 && formal / total > 0.6) return "faculty";
	return card.tier;
}

/** Cold card (design doc §2 cold start): formal defaults, empty lexicons. */
export function createColdCard(
	address: string,
	displayName: string,
	tier?: Tier,
): RelationshipCardT {
	return {
		address,
		displayName,
		tier: tier ?? recipientTierHeuristic(address, displayName),
		greetings: [],
		closings: [],
		threadGreetingHabit: { start: "greet", mid: "none" },
		registerHist: {},
		clusterHist: {},
		lengthPrefTokens: 0, // 0 = no learned preference yet (EMA seeds on first sent-diff)
		exemplarTierWeights: { T1: 1.0, T2: 1.0, T3: 1.0 },
		projects: [],
		lastInteraction: "",
		sampleCount: 0,
	};
}

/** Increment a lexicon form (exact-text match); lastUsed only moves forward. */
export function addLexiconEntry(
	entries: readonly LexiconEntryT[],
	text: string,
	usedAtIso: string,
): LexiconEntryT[] {
	const out = entries.map((e) => ({ ...e }));
	const hit = out.find((e) => e.text === text);
	if (hit) {
		hit.count += 1;
		if (usedAtIso > hit.lastUsed) hit.lastUsed = usedAtIso;
		return out;
	}
	out.push({ text, count: 1, lastUsed: usedAtIso });
	return out;
}

export function bumpHist(
	hist: Record<string, number>,
	key: string,
	by = 1,
): void {
	hist[key] = (hist[key] ?? 0) + by;
}

export interface ThreadHabitCounts {
	startGreet: number;
	startNone: number;
	midGreet: number;
	midNone: number;
}

/** Majority per position; zero observations keep the formal default. */
export function resolveThreadHabit(c: ThreadHabitCounts): {
	start: "greet" | "none";
	mid: "greet" | "none";
} {
	return {
		start: c.startNone > c.startGreet ? "none" : "greet",
		mid: c.midGreet > c.midNone ? "greet" : "none",
	};
}
