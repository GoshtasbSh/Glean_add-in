import { describe, expect, it, vi } from "vitest";
import type { GraphFn } from "../src/graph/client";
import { getMessageByInternetId, htmlToText } from "../src/graph/mail";

describe("getMessageByInternetId", () => {
	it("filters by internetMessageId with proper OData quoting and selects the analysis fields", async () => {
		const graphFn = vi.fn().mockResolvedValue({
			value: [
				{ id: "AAMk1", subject: "Hi", body: { content: "<p>hello</p>" } },
			],
		}) as unknown as GraphFn;
		const msg = await getMessageByInternetId("<msg-001@mail.ufl.edu>", graphFn);
		expect(msg).not.toBeNull();
		expect(msg!.id).toBe("AAMk1");

		const [method, path] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(method).toBe("GET");
		// Filter value must be URL-encoded (angle brackets never raw)
		expect(path).not.toContain("<");
		expect(decodeURIComponent(path)).toContain(
			"internetMessageId eq '<msg-001@mail.ufl.edu>'",
		);
		expect(path).toContain(
			"%24select=id%2Csubject%2Cfrom%2CtoRecipients%2CreceivedDateTime%2Cbody%2Ccategories",
		);
	});

	it("escapes single quotes in the message id (OData injection guard)", async () => {
		const graphFn = vi
			.fn()
			.mockResolvedValue({ value: [] }) as unknown as GraphFn;
		await getMessageByInternetId("<o'brien@ufl.edu>", graphFn);
		const [, path] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(decodeURIComponent(path)).toContain("'<o''brien@ufl.edu>'");
	});

	it("returns null when no message matches", async () => {
		const graphFn = vi
			.fn()
			.mockResolvedValue({ value: [] }) as unknown as GraphFn;
		expect(await getMessageByInternetId("<nope@x>", graphFn)).toBeNull();
	});
});

describe("htmlToText", () => {
	it("strips tags and returns readable text", () => {
		expect(htmlToText("<p>Hello <b>world</b></p>")).toBe("Hello world");
	});

	it("drops script and style content entirely", () => {
		expect(
			htmlToText(
				"<style>p{color:red}</style><p>Hi</p><script>alert(1)</script>",
			),
		).toBe("Hi");
	});

	it("collapses whitespace runs", () => {
		expect(htmlToText("<div>a</div>\n\n  <div>b</div>")).toBe("a b");
	});

	it("collapses non-breaking spaces (&nbsp;)", () => {
		expect(htmlToText("<p>hello&nbsp;world</p>")).toBe("hello world");
	});

	it("returns empty string for empty input", () => {
		expect(htmlToText("")).toBe("");
	});
});
