/**
 * Session voice store — the FREE (no-Graph) home for a voice profile trained by
 * uploading the user's own .eml files. The full engine (adaptive 1..6 style
 * clusters + per-person relationship cards + tiered exemplars) runs in this
 * in-memory store for the life of the pane.
 *
 * PERSISTENCE (free, no Graph): on training we save a budget-capped slice to the
 * user's OWN mailbox (roaming settings, 32 KB hard limit) — the multiple style
 * clusters + the most-used per-person cards (greetings/closings/register/
 * dominant style) — so drafts keep adapting per-person after an Outlook restart.
 * The bulky bits (literal example emails, the long tail of correspondents, the
 * project corpus, auto-learning from the inbox) are the OneDrive/Graph (UFIT)
 * tier — they don't fit in roaming settings.
 */
import { createMemStore, type MemStore } from "./memStore";
import {
	type LexiconEntryT,
	type Profile,
	ProfileV1,
	type RelationshipCardT,
	RelationshipsV1,
} from "./schemas";
import { toDraftProfile } from "../draft/profileAdapter";
import type { DraftProfile } from "../draft/pipeline";
import type { RelationshipCard } from "../draft/wrap";
import { hashAddress } from "../intel/relationships";
import {
	roamingGet,
	roamingRemove,
	roamingSave,
	roamingSet,
} from "./roaming";

let store: MemStore = createMemStore();

const VOICE_KEY = "glean.voice.v1";
const LEGACY_COMPACT_KEY = "glean.profile.v1";
// Stay under the 32 KB roaming hard limit (shared with the NaviGator key); the
// rest is margin so saveAsync never throws error 9057.
const ROAMING_BUDGET = 28_000;

function byteLen(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Drop the bulky bits that don't fit roaming: exemplars + cluster sample text. */
function slimProfile(p: Profile): Profile {
	return {
		...p,
		exemplars: [],
		style_clusters: p.style_clusters.map((c) => ({
			...c,
			evidence: { ...c.evidence, sampleOpenings: [] },
		})),
	};
}

/** Trim greeting/closing lists to the top few — the per-person signal is kept. */
function slimCard(c: RelationshipCardT): RelationshipCardT {
	const top = (xs: LexiconEntryT[]) =>
		[...xs].sort((a, b) => b.count - a.count).slice(0, 3);
	return { ...c, greetings: top(c.greetings), closings: top(c.closings) };
}

interface VoiceBlob {
	v: 1;
	profile: Profile;
	relationships: { version: 1; entries: Record<string, RelationshipCardT> };
}

/**
 * Persist the trained voice (multiple styles + per-person cards) to the user's
 * own mailbox so it survives Outlook restarts. Best-effort; no-op if untrained.
 */
export async function persistVoiceToMailbox(): Promise<void> {
	const profRead = await store.read("profile.json", ProfileV1).catch(() => null);
	if (!profRead) return;

	const entries: Record<string, RelationshipCardT> = {};
	const blob = (): VoiceBlob => ({
		v: 1,
		profile: slimProfile(profRead.data),
		relationships: { version: 1, entries },
	});

	const relRead = await store
		.read("relationships.json", RelationshipsV1)
		.catch(() => null);
	if (relRead) {
		// Keep the most-interacted-with correspondents first; stop at the budget.
		const ranked = Object.entries(relRead.data.entries).sort(
			(a, b) => b[1].sampleCount - a[1].sampleCount,
		);
		for (const [hash, card] of ranked) {
			entries[hash] = slimCard(card);
			if (byteLen(blob()) > ROAMING_BUDGET) {
				delete entries[hash];
				break;
			}
		}
	}

	roamingSet(VOICE_KEY, blob());
	roamingRemove(LEGACY_COMPACT_KEY); // reclaim budget from the older write
	await roamingSave();
}

/**
 * On a fresh session, rehydrate the in-memory store from the mailbox copy so the
 * full draft engine (multi-style + per-person) works without re-uploading.
 * No-op once the store already has a profile (trained this session, or hydrated).
 */
async function ensureVoiceLoaded(): Promise<void> {
	if (await store.read("profile.json", ProfileV1).catch(() => null)) return;
	const raw = roamingGet<Partial<VoiceBlob>>(VOICE_KEY);
	if (!raw) return;
	const prof = ProfileV1.safeParse(raw.profile);
	if (!prof.success) return;
	await store.write("profile.json", ProfileV1, prof.data);
	const rel = RelationshipsV1.safeParse(raw.relationships);
	if (rel.success) await store.write("relationships.json", RelationshipsV1, rel.data);
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
	await ensureVoiceLoaded();
	return (await store.read("profile.json", ProfileV1).catch(() => null)) !== null;
}

/** The per-recipient relationship card from the trained relationships. */
export async function loadVoiceCard(
	email: string,
): Promise<RelationshipCard | null> {
	await ensureVoiceLoaded();
	const rel = await store
		.read("relationships.json", RelationshipsV1)
		.catch(() => null);
	if (!rel) return null;
	const hash = await hashAddress(email);
	return (rel.data.entries[hash] as RelationshipCard | undefined) ?? null;
}

/** The trained voice mapped to a DraftProfile for the given recipient, or null. */
export async function loadVoiceProfile(
	email: string,
): Promise<DraftProfile | null> {
	await ensureVoiceLoaded();
	const stored = await store.read("profile.json", ProfileV1).catch(() => null);
	if (!stored) return null;
	const card = await loadVoiceCard(email);
	return toDraftProfile(stored.data, await hashAddress(email), card);
}

/** Names of the fitted style clusters (for chips / "trained" feedback). */
export async function voiceClusterNames(): Promise<string[]> {
	await ensureVoiceLoaded();
	const stored = await store.read("profile.json", ProfileV1).catch(() => null);
	return stored ? stored.data.style_clusters.map((c) => c.name) : [];
}
