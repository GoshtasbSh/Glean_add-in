/**
 * SESSION A3 §3.5 — post-draft fold-in: an ACCEPTED draft folds into its
 * matched project (same chunk path) and refreshes that project's status card.
 * Drafts are never auto-folded — acceptance is an explicit UI action.
 */
import { describe, expect, it } from "vitest";
import {
	acceptDraft,
	type DraftDeps,
	type DraftResult,
} from "../src/draft/pipeline";
import { type FoldDraftDeps, foldAcceptedDraft } from "../src/intel/folddraft";
import { type Project, ProjectV1 } from "../src/store/schemas";
import { createMemStore, type MemStore } from "./helpers/memstore";

const NOW = new Date("2026-06-11T12:00:00Z");

function cedarProject(): Project {
	return {
		version: 1,
		name: "Cedar Key",
		slug: "cedar-key",
		match_rules: {
			participants: ["s.mitchell@ufl.edu"],
			keywords: ["cedar key"],
		},
		status: {
			stage: "active",
			open_threads: [],
			recent_decisions: [],
			next_milestones: [],
			updated_at: "2026-06-01T00:00:00Z",
		},
		graph: { nodes: [], edges: [] },
		chunks: [],
		watermark: "2026-06-01T00:00:00Z",
	};
}

function makeDeps(store: MemStore): FoldDraftDeps {
	return {
		store,
		embed: async (texts) => texts.map(() => [0.5, 0.5]),
		chat: async () => "not json", // status refresh keeps old card
		now: () => NOW,
	};
}

const MESSAGE = {
	internetMessageId: "<x@ufl.edu>",
	conversationId: "conv-42",
	subject: "Cedar Key timeline",
	senderName: "Sarah Mitchell",
	senderEmail: "s.mitchell@ufl.edu",
};

describe("foldAcceptedDraft", () => {
	it("adds exactly one chunk set for the drafted thread (idempotent)", async () => {
		const store = createMemStore();
		await store.write("projects/cedar-key.json", ProjectV1, cedarProject());
		const deps = makeDeps(store);

		const draft =
			"Dear Sarah,\n\nThe revised timeline works on our side.\n\nBest regards,\nGoshtasb";
		const first = await foldAcceptedDraft(MESSAGE, draft, deps);
		expect(first).toBe("cedar-key");
		const after1 = (await store.read("projects/cedar-key.json", ProjectV1))
			?.data;
		const draftChunks1 =
			after1?.chunks.filter((c) => c.source.type === "draft") ?? [];
		expect(draftChunks1).toHaveLength(1);
		expect(draftChunks1[0].source.id).toBe("draft-conv-42:0");

		// Accepting the same draft again must not duplicate the chunk set.
		await foldAcceptedDraft(MESSAGE, draft, deps);
		const after2 = (await store.read("projects/cedar-key.json", ProjectV1))
			?.data;
		expect(
			after2?.chunks.filter((c) => c.source.type === "draft"),
		).toHaveLength(1);
	});

	it("a REVISED accepted draft replaces the prior chunk set (no silent drop)", async () => {
		const store = createMemStore();
		await store.write("projects/cedar-key.json", ProjectV1, cedarProject());
		const deps = makeDeps(store);
		await foldAcceptedDraft(MESSAGE, "First version of the reply.", deps);
		await foldAcceptedDraft(MESSAGE, "Completely revised reply text.", deps);
		const after = (await store.read("projects/cedar-key.json", ProjectV1))
			?.data;
		const draftChunks =
			after?.chunks.filter((c) => c.source.type === "draft") ?? [];
		expect(draftChunks).toHaveLength(1);
		expect(draftChunks[0].text).toBe("Completely revised reply text.");
	});

	it("refuses to fold a PII-bearing draft into the corpus", async () => {
		const store = createMemStore();
		await store.write("projects/cedar-key.json", ProjectV1, cedarProject());
		store.writes.length = 0;
		const result = await foldAcceptedDraft(
			MESSAGE,
			"My UFID: 1234-5678 as requested.",
			makeDeps(store),
		);
		expect(result).toBeNull();
		expect(store.writes).toHaveLength(0);
	});

	it("returns null and writes nothing when no project matches", async () => {
		const store = createMemStore();
		await store.write("projects/cedar-key.json", ProjectV1, cedarProject());
		store.writes.length = 0;
		const result = await foldAcceptedDraft(
			{ ...MESSAGE, subject: "Lunch?", senderEmail: "friend@gmail.com" },
			"See you at noon.",
			makeDeps(store),
		);
		expect(result).toBeNull();
		expect(store.writes).toHaveLength(0);
	});
});

describe("acceptDraft (pipeline hook)", () => {
	it("invokes deps.onAccepted exactly once with the result", async () => {
		const calls: DraftResult[] = [];
		const deps = {
			onAccepted: async (r: DraftResult) => {
				calls.push(r);
			},
		} as unknown as DraftDeps;
		const result: DraftResult = {
			text: "x",
			register: "formal",
			styleUsed: "voice",
			exemplarTiers: ["T1"],
			verifier: { passed: true, reasons: [] },
		};
		await acceptDraft(deps, result);
		expect(calls).toEqual([result]);
	});

	it("is a no-op when the hook is absent", async () => {
		await expect(
			acceptDraft({} as DraftDeps, {} as DraftResult),
		).resolves.toBeUndefined();
	});
});
