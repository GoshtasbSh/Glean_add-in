import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getOpenMessageAsGraph,
	getOpenMessageBody,
} from "../src/office/mailItem";

type BodyCb = (res: { status: string; value?: string }) => void;

function stubOffice(opts: {
	item?: boolean;
	bodyHtml?: string;
	bodyFails?: boolean;
}) {
	const getAsync = vi.fn((_coercion: string, cb: BodyCb) => {
		if (opts.bodyFails) cb({ status: "failed" });
		else cb({ status: "succeeded", value: opts.bodyHtml ?? "<p>hi</p>" });
	});
	vi.stubGlobal("Office", {
		CoercionType: { Html: "html", Text: "text" },
		AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
		context: {
			mailbox: {
				item:
					opts.item === false
						? null
						: {
								subject: "Re: budget",
								sender: {
									displayName: "Dr. Smith",
									emailAddress: "smith@ufl.edu",
								},
								internetMessageId: "<m-1@ufl.edu>",
								conversationId: "conv-1",
								body: { getAsync },
							},
			},
		},
	});
	return { getAsync };
}

describe("getOpenMessageBody", () => {
	beforeEach(() => vi.unstubAllGlobals());

	it("resolves with the open item's HTML body", async () => {
		stubOffice({ bodyHtml: "<p>Hello there</p>" });
		expect(await getOpenMessageBody()).toBe("<p>Hello there</p>");
	});

	it("requests the HTML coercion type", async () => {
		const { getAsync } = stubOffice({});
		await getOpenMessageBody();
		expect(getAsync.mock.calls[0][0]).toBe("html");
	});

	it("rejects when the body read fails", async () => {
		stubOffice({ bodyFails: true });
		await expect(getOpenMessageBody()).rejects.toThrow();
	});

	it("rejects when there is no open item", async () => {
		stubOffice({ item: false });
		await expect(getOpenMessageBody()).rejects.toThrow();
	});
});

describe("getOpenMessageAsGraph", () => {
	beforeEach(() => vi.unstubAllGlobals());

	it("returns a GraphMessage-shaped object from the open item (no Graph call)", async () => {
		stubOffice({ bodyHtml: "<p>Body text</p>" });
		const msg = await getOpenMessageAsGraph();
		expect(msg).not.toBeNull();
		expect(msg!.id).toBe("<m-1@ufl.edu>");
		expect(msg!.subject).toBe("Re: budget");
		expect(msg!.from?.emailAddress.address).toBe("smith@ufl.edu");
		expect(msg!.conversationId).toBe("conv-1");
		expect(msg!.body?.content).toBe("<p>Body text</p>");
		expect(msg!.body?.contentType).toBe("html");
	});

	it("returns null when no message is open", async () => {
		stubOffice({ item: false });
		expect(await getOpenMessageAsGraph()).toBeNull();
	});
});
