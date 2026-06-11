/**
 * SESSION A3 §3.4 — sent-diff zero-click learning (design doc §3.3).
 * Pure math, no LLM: match feedback-queue entries to actual sent replies,
 * update the relationship card, expire unmatched entries after 14 days.
 */
import { describe, expect, it } from "vitest";
import { selectGreeting } from "../src/draft/wrap";
import { extendedFeatureVector } from "../src/intel/features";
import { createColdCard, hashAddress } from "../src/intel/relationships";
import {
	applySentDiff,
	editWeight,
	type SentMessageLite,
} from "../src/intel/sentdiff";
import type { FeedbackEntry, Relationships } from "../src/store/schemas";

const ADVISOR = "j.vonmeding@ufl.edu";
const NOW = "2026-06-11T00:00:00Z";

function entry(over: Partial<FeedbackEntry> = {}): FeedbackEntry {
	return {
		conversationId: "conv-1",
		recipientHash: "PENDING",
		draftFeatures: extendedFeatureVector(
			"Dear Jason,\n\nSounds good, I will send it over.\n\nBest,\nG",
		),
		greetingUsed: "Dear Jason,",
		closingUsed: "Best,\nG",
		tierUsed: "T4",
		bodyTokens: 12,
		ts: "2026-06-10T00:00:00Z",
		...over,
	};
}

const SENT_BODY =
	"Dear Dr Von Meding,\n\nSounds good — I will send the revised chapter over tomorrow morning.\n\nBest regards,\nGoshtasb";

function sentReply(over: Partial<SentMessageLite> = {}): SentMessageLite {
	return {
		conversationId: "conv-1",
		to: [ADVISOR],
		toName: "Jason Von Meding",
		bodyClean: SENT_BODY,
		sentAt: "2026-06-10T02:00:00Z",
		...over,
	};
}

async function relsWithColdCard(): Promise<{
	rels: Relationships;
	key: string;
}> {
	const key = await hashAddress(ADVISOR);
	return {
		rels: {
			version: 1,
			entries: { [key]: createColdCard(ADVISOR, "Jason Von Meding") },
		},
		key,
	};
}

describe("applySentDiff — the greeting self-correction loop (DoD scenario)", () => {
	it("draft said 'Dear Jason,', user sent 'Dear Dr Von Meding,' → card learns the real form", async () => {
		const { rels, key } = await relsWithColdCard();
		const e = entry({ recipientHash: key });
		const result = await applySentDiff([e], [sentReply()], rels, NOW);

		expect(result.matched).toBe(1);
		expect(result.remaining).toHaveLength(0);
		const card = rels.entries[key];
		expect(card.greetings).toContainEqual(
			expect.objectContaining({ text: "Dear Dr Von Meding," }),
		);
		// The NEXT wrap now produces the corrected greeting.
		expect(selectGreeting(card, "start", new Date(NOW))).toBe(
			"Dear Dr Von Meding,",
		);
	});

	it("increments the closing lexicon from the sent reply", async () => {
		const { rels, key } = await relsWithColdCard();
		await applySentDiff(
			[entry({ recipientHash: key })],
			[sentReply()],
			rels,
			NOW,
		);
		expect(rels.entries[key].closings).toContainEqual(
			expect.objectContaining({ text: "Best regards,\nGoshtasb" }),
		);
	});

	it("seeds lengthPrefTokens on first match, then EMA α=0.3", async () => {
		const { rels, key } = await relsWithColdCard();
		await applySentDiff(
			[entry({ recipientHash: key })],
			[sentReply()],
			rels,
			NOW,
		);
		const seeded = rels.entries[key].lengthPrefTokens;
		expect(seeded).toBeGreaterThan(0); // = sent tokens on a cold card

		// second observation: EMA moves 30% toward the new value
		const second = entry({
			recipientHash: key,
			conversationId: "conv-2",
			ts: "2026-06-10T05:00:00Z",
		});
		await applySentDiff(
			[second],
			[sentReply({ conversationId: "conv-2", sentAt: "2026-06-10T06:00:00Z" })],
			rels,
			NOW,
		);
		const after = rels.entries[key].lengthPrefTokens;
		expect(after).toBe(seeded); // same sent length -> EMA unchanged

		// Third observation with a DIFFERENT length actually exercises α
		// (review finding: same-length assertion was a tautology).
		const longBody = `${SENT_BODY}\n\nP.S. One more paragraph with additional detail about the rerun results and the new figures.`;
		await applySentDiff(
			[
				entry({
					recipientHash: key,
					conversationId: "conv-3",
					ts: "2026-06-10T07:00:00Z",
				}),
			],
			[
				sentReply({
					conversationId: "conv-3",
					sentAt: "2026-06-10T08:00:00Z",
					bodyClean: longBody,
				}),
			],
			rels,
			NOW,
		);
		const newTokens = Math.ceil(longBody.length / 4);
		expect(rels.entries[key].lengthPrefTokens).toBe(
			Math.round(0.3 * newTokens + 0.7 * after),
		);
	});

	it("keeps a matched entry whose card does not exist yet (replay later)", async () => {
		const rels: Relationships = { version: 1, entries: {} }; // no card at all
		const e = entry({ recipientHash: "unknown-hash" });
		const result = await applySentDiff([e], [sentReply()], rels, NOW);
		expect(result.matched).toBe(0);
		expect(result.remaining).toEqual([e]);
	});

	it("downweights the used tier ×0.8 (floor 0.4) on a rewrite", async () => {
		const { rels, key } = await relsWithColdCard();
		// Draft was 12 tokens; sent is far longer -> rewrite (>0.5 normalized delta).
		const e = entry({ recipientHash: key, tierUsed: "T2", bodyTokens: 5 });
		await applySentDiff([e], [sentReply()], rels, NOW);
		expect(rels.entries[key].exemplarTierWeights.T2).toBeCloseTo(0.8);

		// Repeated rewrites floor at 0.4.
		for (let i = 0; i < 10; i++) {
			await applySentDiff(
				[
					entry({
						recipientHash: key,
						tierUsed: "T2",
						bodyTokens: 5,
						conversationId: `c${i}`,
					}),
				],
				[sentReply({ conversationId: `c${i}` })],
				rels,
				NOW,
			);
		}
		expect(rels.entries[key].exemplarTierWeights.T2).toBeCloseTo(0.4);
	});

	it("nudges the register histogram from the sent reply's band", async () => {
		const { rels, key } = await relsWithColdCard();
		await applySentDiff(
			[entry({ recipientHash: key })],
			[sentReply()],
			rels,
			NOW,
		);
		expect(rels.entries[key].registerHist.formal).toBe(1);
	});

	it("keeps unmatched entries younger than 14 days, expires older ones", async () => {
		const { rels, key } = await relsWithColdCard();
		const young = entry({
			recipientHash: key,
			conversationId: "no-reply-yet",
			ts: "2026-06-01T00:00:00Z",
		});
		const old = entry({
			recipientHash: key,
			conversationId: "stale",
			ts: "2026-05-20T00:00:00Z",
		});
		const result = await applySentDiff([young, old], [], rels, NOW);
		expect(result.matched).toBe(0);
		expect(result.remaining).toEqual([young]);
	});

	it("only matches sent replies AFTER the draft timestamp in the same conversation", async () => {
		const { rels, key } = await relsWithColdCard();
		const e = entry({ recipientHash: key, ts: "2026-06-10T03:00:00Z" }); // after the sent reply
		const result = await applySentDiff([e], [sentReply()], rels, NOW);
		expect(result.matched).toBe(0);
		expect(result.remaining).toEqual([e]);
	});
});

describe("editWeight (length-delta proxy — no draft text is retained by design)", () => {
	it("classifies light/medium/rewrite", () => {
		expect(editWeight(100, 105)).toBe("light"); // 5%
		expect(editWeight(100, 130)).toBe("medium"); // 30%
		expect(editWeight(100, 160)).toBe("rewrite"); // 60%
	});
});
