/**
 * Session voice store — the FREE (no-Graph) home for a voice profile trained by
 * uploading the user's own .eml files. Lives in memory for the life of the pane
 * only; nothing is persisted to any server. The Draft tab reads the trained
 * voice from here so manual-upload training actually improves drafts WITHOUT
 * Microsoft Graph or UFIT approval.
 *
 * (The Graph "auto-refit from your whole sent history" path is the gated upgrade
 * — this module is the free counterpart that makes voice work today.)
 */
import { createMemStore, type MemStore } from "./memStore";
import { ProfileV1, RelationshipsV1 } from "./schemas";
import { toDraftProfile } from "../draft/profileAdapter";
import type { DraftProfile } from "../draft/pipeline";
import type { RelationshipCard } from "../draft/wrap";
import { hashAddress } from "../intel/relationships";
import { loadFreeProfile, saveFreeProfile } from "./roaming";

let store: MemStore = createMemStore();

/**
 * Persist a COMPACT copy of the just-trained voice to the user's OWN mailbox
 * (roaming settings) so it survives Outlook restarts — train once, not every
 * session. Roaming settings are for small data, so the full exemplar corpus is
 * dropped (the voice summary + synthesis carry the style); the rich per-person
 * corpus is the OneDrive/Graph upgrade. Best-effort; no-op if nothing trained.
 */
export async function persistVoiceToMailbox(): Promise<void> {
	const stored = await store.read("profile.json", ProfileV1).catch(() => null);
	if (!stored) return;
	const base = toDraftProfile(stored.data, "", null);
	const compact: DraftProfile = {
		...base,
		exemplarPools: undefined,
		styleName: stored.data.style_clusters[0]?.name,
	};
	await saveFreeProfile(compact);
}

/** The in-memory store fitVoice writes profile.json + relationships.json into. */
export function getVoiceStore(): MemStore {
  return store;
}

/** Drop the trained voice (e.g. between tests, or a "forget my voice" action). */
export function resetVoiceStore(): void {
  store = createMemStore();
}

export async function isVoiceTrained(): Promise<boolean> {
  if ((await store.read("profile.json", ProfileV1).catch(() => null)) !== null)
    return true;
  // A voice persisted to the mailbox in an earlier session also counts.
  return (await loadFreeProfile()) !== null;
}

/** The per-recipient relationship card from the session-trained relationships. */
export async function loadVoiceCard(email: string): Promise<RelationshipCard | null> {
  const rel = await store.read("relationships.json", RelationshipsV1).catch(() => null);
  if (!rel) return null;
  const hash = await hashAddress(email);
  return (rel.data.entries[hash] as RelationshipCard | undefined) ?? null;
}

/** The trained voice mapped to a DraftProfile for the given recipient, or null. */
export async function loadVoiceProfile(email: string): Promise<DraftProfile | null> {
  const stored = await store.read("profile.json", ProfileV1).catch(() => null);
  if (stored) {
    const card = await loadVoiceCard(email);
    return toDraftProfile(stored.data, await hashAddress(email), card);
  }
  // Fresh session: fall back to the compact voice persisted in the mailbox.
  return loadFreeProfile();
}

/** Names of the fitted style clusters (for chips / "trained" feedback). */
export async function voiceClusterNames(): Promise<string[]> {
  const stored = await store.read("profile.json", ProfileV1).catch(() => null);
  if (stored) return stored.data.style_clusters.map((c) => c.name);
  // Persisted (compact) voice keeps a single style name.
  const free = await loadFreeProfile();
  return free?.styleName ? [free.styleName] : [];
}
