/**
 * roamingSettings store — small per-user data kept in the user's OWN mailbox,
 * synced by Exchange across their devices. No Microsoft Graph, no token, no
 * consent. Suitable for compact data only (a voice profile summary, sign-offs,
 * label rules) — NOT a corpus of embeddings (that needs OneDrive = Graph).
 *
 * The free-mode counterpart to store/onedrive.ts.
 */
import type { DraftProfile } from "../draft/pipeline";

const PROFILE_KEY = "glean.profile.v1";

// roamingSettings is only present inside Office; guard so the module is safe in
// plain browsers / tests (no bare `Office` ReferenceError).
function rs(): Office.RoamingSettings | null {
	return typeof Office !== "undefined" && Office.context?.roamingSettings
		? Office.context.roamingSettings
		: null;
}

export function roamingGet<T>(key: string): T | null {
	const s = rs();
	if (!s) return null;
	const v = s.get(key);
	return v === undefined || v === null ? null : (v as T);
}

export function roamingSet(key: string, value: unknown): void {
	rs()?.set(key, value);
}

export function roamingRemove(key: string): void {
	rs()?.remove(key);
}

/** Persist the in-memory roaming settings to the mailbox. */
export function roamingSave(): Promise<void> {
	const s = rs();
	if (!s) return Promise.resolve();
	return new Promise((resolve, reject) => {
		s.saveAsync((res) => {
			if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
			else reject(new Error("Failed to save roaming settings"));
		});
	});
}

/**
 * Shape-check a value read from roaming settings before trusting it as a
 * DraftProfile. roamingSettings is the user's own mailbox data, but it may be
 * stale (an older app version) or hand-edited — validate the required fields
 * rather than casting blindly (security review).
 */
function isDraftProfile(v: unknown): v is DraftProfile {
	if (v === null || typeof v !== "object") return false;
	const p = v as Record<string, unknown>;
	return (
		typeof p.summary === "string" &&
		Array.isArray(p.bannedPhrases) &&
		Array.isArray(p.userSignoffs) &&
		typeof p.userFullName === "string"
	);
}

/** The compact, free-mode voice profile (no exemplar embeddings — too large). */
export async function loadFreeProfile(): Promise<DraftProfile | null> {
	const raw = roamingGet<unknown>(PROFILE_KEY);
	return isDraftProfile(raw) ? raw : null;
}

export async function saveFreeProfile(profile: DraftProfile): Promise<void> {
	roamingSet(PROFILE_KEY, profile);
	await roamingSave();
}
