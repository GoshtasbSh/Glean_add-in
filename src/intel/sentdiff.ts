/**
 * Sent-diff zero-click learning — SESSION A3 §3.4 (design doc §3.3).
 *
 * Match feedback-queue entries (written by the A2 draft pipeline) to the
 * user's ACTUAL sent replies in the same conversation, then update the
 * relationship card: greeting/closing lexicon increments, lengthPrefTokens
 * EMA (α=0.3), register-histogram nudge, edit-weight buckets, rewrite →
 * exemplarTierWeights[tier] ×0.8 (floor 0.4). Unmatched entries expire after
 * 14 days. Pure math — no LLM, no clicks, no new custody.
 *
 * Deviation (documented §8): the design doc's "normalized token edit
 * distance" needs the draft text, which the queue deliberately does NOT keep
 * (features + forms only). The edit weight uses the normalized token-LENGTH
 * delta instead — light(<0.15) / medium / rewrite(>0.5) on the same scale.
 */

import type { FeedbackEntry, Relationships } from "../store/schemas";
import { extendedFeatureVector, FEATURE_NAMES } from "./features";
import { extractClosing, extractGreeting } from "./lexicon";
import { registerBand } from "./onboarding";
import { addLexiconEntry, bumpHist } from "./relationships";

const EMA_ALPHA = 0.3;
const TIER_WEIGHT_FACTOR = 0.8;
const TIER_WEIGHT_FLOOR = 0.4;
const EXPIRY_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/** The slice of a sent Graph message sent-diff needs (caller pre-strips). */
export interface SentMessageLite {
	conversationId: string;
	to: string[];
	toName: string;
	bodyClean: string;
	sentAt: string;
}

export interface SentDiffResult {
	matched: number;
	/** recipientHashes whose cards changed (caller persists relationships). */
	updatedCards: string[];
	/** Queue entries to keep (unmatched, younger than 14 days). */
	remaining: FeedbackEntry[];
}

export type EditWeight = "light" | "medium" | "rewrite";

/** Normalized token-length delta buckets (see module note). */
export function editWeight(
	draftTokens: number,
	sentTokens: number,
): EditWeight {
	const delta = Math.abs(sentTokens - draftTokens) / Math.max(draftTokens, 1);
	if (delta < 0.15) return "light";
	if (delta > 0.5) return "rewrite";
	return "medium";
}

const approxTokens = (text: string): number => Math.ceil(text.length / 4);

export async function applySentDiff(
	queue: readonly FeedbackEntry[],
	sentItems: readonly SentMessageLite[],
	relationships: Relationships,
	nowIso: string,
): Promise<SentDiffResult> {
	const formalityIdx = FEATURE_NAMES.indexOf("formality");
	const nowMs = new Date(nowIso).getTime();
	const remaining: FeedbackEntry[] = [];
	const updated = new Set<string>();
	let matched = 0;

	// Earliest-first so an entry matches the FIRST reply after its draft.
	const sentAsc = [...sentItems].sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1));

	for (const entry of queue) {
		const reply = sentAsc.find(
			(s) => s.conversationId === entry.conversationId && s.sentAt > entry.ts,
		);
		if (!reply) {
			const ageDays = (nowMs - new Date(entry.ts).getTime()) / MS_PER_DAY;
			if (ageDays <= EXPIRY_DAYS) remaining.push(entry);
			continue; // expired entries are dropped
		}

		const card = relationships.entries[entry.recipientHash];
		if (!card) {
			// Reply found but no card to learn into yet — keep the entry so a
			// later run (after the card exists) can replay it, until expiry.
			const ageDays = (nowMs - new Date(entry.ts).getTime()) / MS_PER_DAY;
			if (ageDays <= EXPIRY_DAYS) remaining.push(entry);
			continue;
		}
		matched += 1;

		// Greeting/closing ACTUALLY used → lexicon increments (the self-correction).
		const greeting = extractGreeting(reply.bodyClean);
		const closing = extractClosing(reply.bodyClean);
		if (greeting)
			card.greetings = addLexiconEntry(
				card.greetings,
				greeting.text,
				reply.sentAt,
			);
		if (closing)
			card.closings = addLexiconEntry(card.closings, closing, reply.sentAt);

		// Length preference EMA (α=0.3); first observation seeds directly.
		const sentTokens = approxTokens(reply.bodyClean);
		card.lengthPrefTokens =
			card.lengthPrefTokens === 0
				? sentTokens
				: Math.round(
						EMA_ALPHA * sentTokens + (1 - EMA_ALPHA) * card.lengthPrefTokens,
					);

		// Register nudge from the sent reply's stylometric band.
		const sentFeatures = extendedFeatureVector(reply.bodyClean);
		bumpHist(card.registerHist, registerBand(sentFeatures[formalityIdx]));

		// Edit weight: rewrite downweights the exemplar tier that produced the draft.
		if (editWeight(entry.bodyTokens, sentTokens) === "rewrite") {
			const w = card.exemplarTierWeights[entry.tierUsed];
			if (w !== undefined) {
				card.exemplarTierWeights[entry.tierUsed] = Math.max(
					TIER_WEIGHT_FLOOR,
					w * TIER_WEIGHT_FACTOR,
				);
			}
		}

		if (reply.sentAt > card.lastInteraction)
			card.lastInteraction = reply.sentAt;
		updated.add(entry.recipientHash);
	}

	return { matched, updatedCards: [...updated], remaining };
}
