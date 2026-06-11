/**
 * Semantic seed-matcher — port of the pure scan in
 * backend/src/glean/labels/seed_matcher.py:96-99 (+ query-text construction,
 * seed_matcher.py:62). Embeds the label's description once and ranks the
 * corpus by cosine; everything at/above the calibrated floor gets the tag.
 *
 * Tags are ADDITIVE (non-exclusive only) — the caller enforces that rule,
 * mirroring the Python guard (label.exclusive -> no seeding).
 */
import { cosine } from "./vectors";

/** Calibrated floor — seed_matcher.py:37. */
export const SEED_MIN_SIM = 0.66;

/** seed_matcher.py:62 — same prefix as email embeddings so vectors share a space. */
export function buildSeedQueryText(
	name: string,
	description: string,
	prefix: string,
): string {
	return `${prefix}${name}\n\n${description || ""}`.trim();
}

export interface SeedFixture {
	id: string;
	vec: readonly number[];
}

export interface SeedMatchResult {
	sims: { id: string; sim: number }[];
	tagged: string[];
}

export function seedMatch(
	queryVec: readonly number[],
	fixtures: readonly SeedFixture[],
	minSim: number = SEED_MIN_SIM,
): SeedMatchResult {
	const sims = fixtures
		.map((f) => ({ id: f.id, sim: cosine(queryVec, f.vec) }))
		.sort((a, b) => b.sim - a.sim); // stable, parity with Python sorted()
	const tagged: string[] = [];
	for (const row of sims) {
		if (row.sim < minSim) break; // ordered scan: below the floor, all rest are too
		tagged.push(row.id);
	}
	return { sims, tagged };
}
