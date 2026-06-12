import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelBar } from "../../src/ui/LabelBar";
import type { OpenMessage } from "../../src/office/context";

const MSG: OpenMessage = {
	subject: "Re: lunch",
	senderName: "Alice",
	senderEmail: "alice@ufl.edu",
	internetMessageId: "<id1>",
	conversationId: "c1",
};

type Cb = (r: { status: string; value?: unknown }) => void;

afterEach(() => vi.unstubAllGlobals());

describe("LabelBar (free Office.js categories)", () => {
	it("renders nothing when no email is open", () => {
		const { container } = render(<LabelBar message={null} />);
		expect(container.firstChild).toBeNull();
	});

	it("applies an Outlook category to the open email — no Graph", async () => {
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

		render(<LabelBar message={MSG} />);
		await userEvent.click(screen.getByRole("button", { name: "To respond" }));

		expect(itemAdd).toHaveBeenCalledWith(
			["Glean/To respond"],
			expect.any(Function),
		);
		expect(await screen.findByText(/Labeled/)).toBeInTheDocument();
	});

	it("surfaces an error when Office.js fails", async () => {
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					masterCategories: { getAsync: (cb: Cb) => cb({ status: "failed" }) },
					item: { categories: { addAsync: vi.fn() } },
				},
			},
			AsyncResultStatus: { Succeeded: "succeeded" },
		});

		render(<LabelBar message={MSG} />);
		await userEvent.click(screen.getByRole("button", { name: "FYI" }));
		expect(await screen.findByText(/Couldn/)).toBeInTheDocument();
	});
});
