import { describe, expect, it, vi } from "vitest";
import { createFreeDraftDeps } from "../src/draft/freeDeps";
import type { GraphMessage } from "../src/graph/mail";

const MSG: GraphMessage = {
	id: "<m-1@ufl.edu>",
	subject: "Re: budget",
	from: { emailAddress: { name: "Dr. Smith", address: "smith@ufl.edu" } },
	conversationId: "conv-1",
	body: { contentType: "html", content: "<p>hi</p>" },
};

describe("createFreeDraftDeps", () => {
	it("fetchMessage returns the open Office.js message (ignores the id)", async () => {
		const fetchOpenMessage = vi.fn(async () => MSG);
		const deps = createFreeDraftDeps({ fetchOpenMessage });
		expect(await deps.fetchMessage("anything")).toBe(MSG);
		expect(fetchOpenMessage).toHaveBeenCalled();
	});

	it("loadCard always returns null in free mode (cold start)", async () => {
		const deps = createFreeDraftDeps({});
		expect(await deps.loadCard("smith@ufl.edu")).toBeNull();
	});

	it("loadProfile delegates to the injected loader", async () => {
		const profile = {
			summary: "warm",
			bannedPhrases: [],
			userSignoffs: [],
			userFullName: "G",
		};
		const deps = createFreeDraftDeps({ loadProfile: async () => profile });
		expect(await deps.loadProfile()).toBe(profile);
	});

	it("chat adapts to the NaviGator model (defaults to DRAFT_MODEL) and forwards system/user", async () => {
		const navChat = vi.fn(async () => "ok");
		const deps = createFreeDraftDeps({ chat: navChat });
		await deps.chat({ system: "S", user: "U" });
		const arg = navChat.mock.calls[0][0];
		expect(arg.system).toBe("S");
		expect(arg.user).toBe("U");
		expect(arg.model).toBeTruthy();
	});

	it("chat honors an explicit model from the pipeline", async () => {
		const navChat = vi.fn(async () => "ok");
		const deps = createFreeDraftDeps({ chat: navChat });
		await deps.chat({ model: "custom-model", system: "S", user: "U" });
		expect(navChat.mock.calls[0][0].model).toBe("custom-model");
	});

	it("chatStream adapts the model and yields the deltas", async () => {
		const navStream = vi.fn(async function* () {
			yield "a";
			yield "b";
		});
		const deps = createFreeDraftDeps({ chatStream: navStream });
		const out: string[] = [];
		for await (const d of deps.chatStream({ system: "S", user: "U" }))
			out.push(d);
		expect(out).toEqual(["a", "b"]);
		expect(navStream.mock.calls[0][0].model).toBeTruthy();
	});

	it("appendFeedback is a no-op that resolves (no persistent queue in free mode)", async () => {
		const deps = createFreeDraftDeps({});
		await expect(
			deps.appendFeedback({
				conversationId: "c",
				recipientHash: "h",
				draftFeatures: [],
				greetingUsed: "",
				closingUsed: "",
				tierUsed: "T4",
				bodyTokens: 0,
				ts: "2026-06-11T00:00:00Z",
			}),
		).resolves.toBeUndefined();
	});

	it("does not provide thread history or project context in free mode", () => {
		const deps = createFreeDraftDeps({});
		expect(deps.fetchThreadHistory).toBeUndefined();
		expect(deps.loadProjectContext).toBeUndefined();
	});
});
