/**
 * NaviGator model selection. The live /v1/models list is the source of truth
 * (the user verified 21 models, 2026-06-10); these constants are the expected
 * ids and the pick* helpers confirm the exact strings at runtime.
 */

/** Expected drafting model (Llama 3.3 70B) — confirm via pickDraftModel at runtime. */
export const DRAFT_MODEL = "llama-3.3-70b-instruct";
/** Expected embedding model (nomic-embed) — confirm via pickEmbedModel at runtime. */
export const EMBED_MODEL = "nomic-embed-text";

/** First id matching Llama 3.3 / 70B from the live model list, else null. */
export function pickDraftModel(ids: readonly string[]): string | null {
	return ids.find((id) => /llama[-_.]?3\.3.*70b/i.test(id)) ?? null;
}

/** First nomic-embed id from the live model list, else null. */
export function pickEmbedModel(ids: readonly string[]): string | null {
	return ids.find((id) => /nomic[-_.]?embed/i.test(id)) ?? null;
}
