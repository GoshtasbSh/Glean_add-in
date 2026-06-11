import { beforeEach, describe, expect, it, vi } from "vitest";
import { draftToHtml, insertReply } from "../src/office/reply";

describe("draftToHtml", () => {
	it("escapes HTML and converts newlines to <br>", () => {
		expect(draftToHtml("Hi <b>&\nBest")).toBe("Hi &lt;b&gt;&amp;<br>Best");
	});
});

describe("insertReply", () => {
	beforeEach(() => vi.unstubAllGlobals());

	it("calls displayReplyForm with the draft as htmlBody", () => {
		const displayReplyForm = vi.fn();
		vi.stubGlobal("Office", {
			context: { mailbox: { item: { displayReplyForm } } },
		});
		insertReply("Hello\nthere");
		expect(displayReplyForm).toHaveBeenCalledWith({
			htmlBody: "Hello<br>there",
		});
	});

	it("throws when no open message is available", () => {
		vi.stubGlobal("Office", { context: { mailbox: { item: undefined } } });
		expect(() => insertReply("x")).toThrow();
	});
});
