/**
 * Tiered exemplar ladder — design doc §2. Few-shot exemplars (3-4, labeled
 * by tier in the prompt):
 *   T1 sent mail to THIS person -> T2 dominant-cluster -> T3 register-level
 *   -> T4 neutral formal default (zero history).
 * The caller builds the pools (T1 from pair history, T2/T3 from the profile);
 * this module owns the fill/fallback policy so it is unit-testable per path.
 */

export type ExemplarTier = "T1" | "T2" | "T3" | "T4";

export interface ExemplarInput {
	body: string;
}

export interface ExemplarPools {
	/** Sent mail to THIS person (recency-weighted style match, best first). */
	t1: ExemplarInput[];
	/** Dominant-cluster exemplars (same voice with similar people). */
	t2: ExemplarInput[];
	/** Register-level exemplars (formality prior). */
	t3: ExemplarInput[];
}

export interface TieredExemplar {
	tier: ExemplarTier;
	body: string;
}

export const MIN_EXEMPLARS = 3;
export const MAX_EXEMPLARS = 4;

/** Built-in neutral formal exemplar for true cold start (no corpus at all). */
export const T4_NEUTRAL_FORMAL =
	"Thank you for your email. I have reviewed the materials and will follow up " +
	"with my comments shortly. Please let me know if there is anything specific " +
	"you would like me to focus on.";

/**
 * Fill T1 -> T2 -> T3 up to MAX_EXEMPLARS; if fewer than MIN_EXEMPLARS were
 * found, top up with the T4 neutral formal default (always >= 1 exemplar).
 * Identical bodies are deduplicated across tiers (first tier wins).
 */
export function selectExemplars(pools: ExemplarPools): TieredExemplar[] {
	const out: TieredExemplar[] = [];
	const seen = new Set<string>();
	const tiers: [ExemplarTier, ExemplarInput[]][] = [
		["T1", pools.t1],
		["T2", pools.t2],
		["T3", pools.t3],
	];
	for (const [tier, pool] of tiers) {
		for (const ex of pool) {
			if (out.length >= MAX_EXEMPLARS) return out;
			if (seen.has(ex.body)) continue;
			seen.add(ex.body);
			out.push({ tier, body: ex.body });
		}
	}
	// Unconditional top-up: even if a pool already contained the T4 text, a
	// sparse ladder still gets the neutral default appended once.
	if (out.length < MIN_EXEMPLARS) {
		out.push({ tier: "T4", body: T4_NEUTRAL_FORMAL });
	}
	return out;
}
