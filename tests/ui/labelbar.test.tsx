import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelBar } from "../../src/ui/LabelBar";
import { chat } from "../../src/llm/navigator";
import type { OpenMessage } from "../../src/office/context";

// Mock only the NaviGator chat call; keep the rest of the module real.
vi.mock("../../src/llm/navigator", async (orig) => ({
	...(await orig<typeof import("../../src/llm/navigator")>()),
	chat: vi.fn(),
}));

const MSG: OpenMessage = {
	subject: "Re: budget",
	senderName: "Alice",
	senderEmail: "alice@ufl.edu",
	internetMessageId: "<id1>",
	conversationId: "c1",
};

type Cb = (r: { status: string; value?: unknown }) => void;

beforeEach(() => {
	sessionStorage.clear();
	vi.mocked(chat).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("LabelBar (free Office.js categories)", () => {
	it("renders nothing when no email is open", () => {
		const { container } = render(<LabelBar message={null} />);
		expect(container.firstChild).toBeNull();
	});

	it("manual override applies an Outlook category — no Graph, no key needed", async () => {
		const itemAdd = vi.fn((_c: unknown, cb: Cb) => cb({ status: "succeeded" }));
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					masterCategories: {
						getAsync: (cb: Cb) => cb({ status: "succeeded", value: [] }),
						addAsync: (_c: unknown, cb: Cb) => cb({ status: "succeeded" }),
					},
					item: { categories: { addAsync: itemAdd } },
				},
			},
			AsyncResultStatus: { Succeeded: "succeeded" },
		});

		render(<LabelBar message={MSG} />); // no key → no auto-classify
		await userEvent.click(screen.getByRole("button", { name: "To respond" }));

		expect(itemAdd).toHaveBeenCalledWith(
			["To respond"],
			expect.any(Function),
		);
		expect(await screen.findByText(/Labeled/)).toBeInTheDocument();
		expect(chat).not.toHaveBeenCalled();
	});

	it("AUTO-classifies + applies the category when an email opens (with key)", async () => {
		vi.mocked(chat).mockResolvedValue("To respond");
		sessionStorage.setItem("glean.navigator.key", "k");
		const itemAdd = vi.fn((_c: unknown, cb: Cb) => cb({ status: "succeeded" }));
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					masterCategories: {
						getAsync: (cb: Cb) => cb({ status: "succeeded", value: [] }),
						addAsync: (_c: unknown, cb: Cb) => cb({ status: "succeeded" }),
					},
					item: {
						body: {
							getAsync: (_t: unknown, cb: Cb) =>
								cb({ status: "succeeded", value: "<p>Can you review by Friday?</p>" }),
						},
						categories: { addAsync: itemAdd },
					},
				},
			},
			CoercionType: { Html: "html" },
			AsyncResultStatus: { Succeeded: "succeeded" },
		});

		render(<LabelBar message={MSG} />);

		expect(await screen.findByText(/Auto-labeled/)).toBeInTheDocument();
		expect(itemAdd).toHaveBeenCalledWith(
			["To respond"],
			expect.any(Function),
		);
		expect(chat).toHaveBeenCalledTimes(1);
	});

	it("surfaces an error when applying a label fails", async () => {
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					item: {
						categories: {
							addAsync: (_c: unknown, cb: Cb) => cb({ status: "failed" }),
						},
					},
				},
			},
			AsyncResultStatus: { Succeeded: "succeeded" },
		});

		render(<LabelBar message={MSG} />);
		await userEvent.click(screen.getByRole("button", { name: "FYI" }));
		expect(await screen.findByText(/Couldn/)).toBeInTheDocument();
	});
});
