/**
 * SESSION A3 §3.2 — paginated mailbox scan over Graph. Pagination follows
 * @odata.nextLink verbatim; cap stops cleanly; abort throws between pages;
 * onPage reports progress. 429 handling lives in graph/client (A1) — not here.
 */
import { describe, expect, it } from "vitest";
import type { GraphFn } from "../src/graph/client";
import { listInboxSince, listSentSince } from "../src/intel/scan";

interface Page {
	value: { id: string; receivedDateTime: string }[];
	"@odata.nextLink"?: string;
}

function fakeGraph(pages: Record<string, Page>, calls: string[] = []): GraphFn {
	return (async (_method: string, path: string) => {
		calls.push(path);
		const hit = Object.entries(pages).find(([key]) => path.includes(key));
		if (!hit) throw new Error(`unexpected path: ${path}`);
		return hit[1];
	}) as GraphFn;
}

const msg = (id: string) => ({ id, receivedDateTime: "2026-06-10T00:00:00Z" });

describe("listSentSince", () => {
	it("queries sentitems with $filter/$orderby/$select and returns one page", async () => {
		const calls: string[] = [];
		const graphFn = fakeGraph(
			{ sentitems: { value: [msg("a"), msg("b")] } },
			calls,
		);
		const out = await listSentSince("2026-01-01T00:00:00Z", { graphFn });
		expect(out.map((m) => m.id)).toEqual(["a", "b"]);
		expect(calls[0]).toContain("/me/mailFolders/sentitems/messages");
		expect(calls[0]).toContain(
			"%24filter=receivedDateTime%20ge%202026-01-01T00%3A00%3A00Z",
		);
		expect(calls[0]).toContain("%24orderby=receivedDateTime%20asc");
		expect(calls[0]).toContain("%24select=");
	});

	it("follows @odata.nextLink until exhausted", async () => {
		const pages: Record<string, Page> = {
			sentitems: {
				value: [msg("a")],
				"@odata.nextLink":
					"https://graph.microsoft.com/v1.0/me/messages?%24skiptoken=PAGE2",
			},
			PAGE2: { value: [msg("b")] },
		};
		const out = await listSentSince("2026-01-01T00:00:00Z", {
			graphFn: fakeGraph(pages),
		});
		expect(out.map((m) => m.id)).toEqual(["a", "b"]);
	});

	it("stops at the cap mid-page and trims the overflow", async () => {
		const pages: Record<string, Page> = {
			sentitems: {
				value: [msg("a"), msg("b"), msg("c")],
				"@odata.nextLink":
					"https://graph.microsoft.com/v1.0/me/messages?%24skiptoken=NEVER",
			},
		};
		const calls: string[] = [];
		const out = await listSentSince("2026-01-01T00:00:00Z", {
			cap: 2,
			graphFn: fakeGraph(pages, calls),
		});
		expect(out.map((m) => m.id)).toEqual(["a", "b"]);
		expect(calls).toHaveLength(1); // never fetched the next page
	});

	it("reports progress per page via onPage", async () => {
		const pages: Record<string, Page> = {
			sentitems: {
				value: [msg("a"), msg("b")],
				"@odata.nextLink":
					"https://graph.microsoft.com/v1.0/me/messages?%24skiptoken=P2",
			},
			P2: { value: [msg("c")] },
		};
		const seen: number[] = [];
		await listSentSince("2026-01-01T00:00:00Z", {
			graphFn: fakeGraph(pages),
			onPage: (fetched) => seen.push(fetched),
		});
		expect(seen).toEqual([2, 3]);
	});

	it("aborts between pages with an AbortError", async () => {
		const controller = new AbortController();
		const pages: Record<string, Page> = {
			sentitems: {
				value: [msg("a")],
				"@odata.nextLink":
					"https://graph.microsoft.com/v1.0/me/messages?%24skiptoken=P2",
			},
			P2: { value: [msg("b")] },
		};
		const promise = listSentSince("2026-01-01T00:00:00Z", {
			graphFn: fakeGraph(pages),
			abort: controller.signal,
			onPage: () => controller.abort(),
		});
		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
	});
});

describe("listInboxSince", () => {
	it("queries the inbox folder", async () => {
		const calls: string[] = [];
		const graphFn = fakeGraph({ inbox: { value: [msg("x")] } }, calls);
		const out = await listInboxSince("2026-06-01T00:00:00Z", { graphFn });
		expect(out.map((m) => m.id)).toEqual(["x"]);
		expect(calls[0]).toContain("/me/mailFolders/inbox/messages");
	});
});
