import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOpenMessage } from "../src/office/context";

const makeItem = (
	overrides: Partial<Office.MessageRead> = {},
): Office.MessageRead =>
	({
		subject: "Test Subject",
		sender: { displayName: "Alice Smith", emailAddress: "alice@ufl.edu" },
		internetMessageId: "<msg-001@mail.ufl.edu>",
		conversationId: "AAQkADEz",
		...overrides,
	}) as unknown as Office.MessageRead;

describe("getOpenMessage", () => {
	beforeEach(() => {
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					item: makeItem(),
				},
			},
		});
	});

	it("returns subject and sender from the open item", () => {
		const msg = getOpenMessage();
		expect(msg).not.toBeNull();
		expect(msg!.subject).toBe("Test Subject");
		expect(msg!.senderName).toBe("Alice Smith");
		expect(msg!.senderEmail).toBe("alice@ufl.edu");
	});

	it("returns internetMessageId and conversationId", () => {
		const msg = getOpenMessage();
		expect(msg!.internetMessageId).toBe("<msg-001@mail.ufl.edu>");
		expect(msg!.conversationId).toBe("AAQkADEz");
	});

	it("returns null when no item is selected", () => {
		vi.stubGlobal("Office", {
			context: { mailbox: { item: null } },
		});
		expect(getOpenMessage()).toBeNull();
	});

	it("returns null when Office context is not available", () => {
		vi.stubGlobal("Office", undefined);
		expect(getOpenMessage()).toBeNull();
	});

	it("handles missing sender gracefully", () => {
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					item: makeItem({
						sender: undefined as unknown as Office.EmailAddressDetails,
					}),
				},
			},
		});
		const msg = getOpenMessage();
		expect(msg).not.toBeNull();
		expect(msg!.senderName).toBe("");
		expect(msg!.senderEmail).toBe("");
	});
});
