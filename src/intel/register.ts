/**
 * Register prediction — port of backend/src/glean/voice/register.py.
 *
 * Continuous per-recipient formality -> 3 legible levels, with FAIL-FORMAL:
 * a thin or absent signal defaults to "formal" (informality where formality
 * is expected measurably lowers perceived competence — asymmetric cost).
 */

export const MIN_N = 5;
const FORMAL_AT = 0.66;
const CASUAL_AT = 0.33;

export type RegisterLevel = "casual" | "neutral" | "formal";

export function formalityLevel(
	mean: number | null,
	n: number,
	minN: number = MIN_N,
): RegisterLevel {
	if (mean === null || n < minN) return "formal";
	if (mean >= FORMAL_AT) return "formal";
	if (mean <= CASUAL_AT) return "casual";
	return "neutral";
}

const LEVEL_NOTE: Record<RegisterLevel, string> = {
	formal: "formal — use a polite greeting and full sign-off",
	neutral: "neutral — match the exemplars",
	casual: "casual — short, first-name, minimal sign-off",
};

export function levelNote(level: string): string {
	return LEVEL_NOTE[level as RegisterLevel] ?? LEVEL_NOTE.formal;
}
