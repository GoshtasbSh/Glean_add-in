import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DOMPurify from "dompurify";
import { InsertButton } from "../../src/ui/InsertButton";

describe("InsertButton", () => {
	let displayReplyFormSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		displayReplyFormSpy = vi.fn();
		vi.stubGlobal("Office", {
			context: {
				mailbox: {
					item: {
						displayReplyForm: displayReplyFormSpy,
					},
				},
			},
		});
	});

	it("calls displayReplyForm with sanitized HTML on click", () => {
		const sanitizeSpy = vi.spyOn(DOMPurify, "sanitize");
		const draft = "Dear Dr. Chen,\n\nPlease find attached.\n\nBest,\nGoshtasb";
		render(<InsertButton draftText={draft} disabled={false} />);

		fireEvent.click(screen.getByRole("button", { name: /insert into reply/i }));

		expect(sanitizeSpy).toHaveBeenCalled();
		expect(displayReplyFormSpy).toHaveBeenCalledTimes(1);
		const calledWith = displayReplyFormSpy.mock.calls[0][0];
		expect(calledWith).toHaveProperty("htmlBody");
	});

	it("escapes script tags before inserting — no unescaped <script> in htmlBody", () => {
		// draftText is PLAIN TEXT from the pipeline. draftToHtml escapes < > to &lt; &gt;
		// so <script>alert()</script> becomes &lt;script&gt;... — safe text, not executable.
		// sanitizeHtml then sees no real script tag and passes it through as escaped text.
		const maliciousDraft = 'Hello<script>alert("xss")</script>';
		render(<InsertButton draftText={maliciousDraft} disabled={false} />);

		fireEvent.click(screen.getByRole("button", { name: /insert into reply/i }));

		const html: string = displayReplyFormSpy.mock.calls[0][0].htmlBody;
		// The literal <script> tag must NOT appear unescaped
		expect(html).not.toContain("<script>");
		// The word "alert" may appear as escaped text — that is safe (not executable)
		expect(html).toContain("&lt;script&gt;");
	});

	it("is disabled when disabled=true", () => {
		render(<InsertButton draftText="Hello" disabled={true} />);
		expect(screen.getByRole("button", { name: /insert into reply/i })).toBeDisabled();
	});
});
