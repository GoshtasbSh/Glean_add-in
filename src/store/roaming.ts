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

export function roamingGet<T>(key: string): T | null {
	const v = Office.context.roamingSettings.get(key);
	return v === undefined || v === null ? null : (v as T);
}

export function roamingSet(key: string, value: unknown): void {
	Office.context.roamingSettings.set(key, value);
}

export function roamingRemove(key: string): void {
	Office.context.roamingSettings.remove(key);
}

/** Persist the in-memory roaming settings to the mailbox. */
export function roamingSave(): Promise<void> {
	return new Promise((resolve, reject) => {
		Office.context.roamingSettings.saveAsync((res) => {
			if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
			else reject(new Error("Failed to save roaming settings"));
		});
	});
}

/** The compact, free-mode voice profile (no exemplar embeddings — too large). */
export async function loadFreeProfile(): Promise<DraftProfile | null> {
	return roamingGet<DraftProfile>(PROFILE_KEY);
}

export async function saveFreeProfile(profile: DraftProfile): Promise<void> {
	roamingSet(PROFILE_KEY, profile);
	await roamingSave();
}
