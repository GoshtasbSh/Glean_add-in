import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StyleChips } from "../../src/ui/StyleChips";

const CHIPS = [
	{ id: "formal", label: "Formal–faculty" },
	{ id: "concise", label: "Concise–admin" },
	{ id: "warm", label: "Warm–students" },
];

describe("StyleChips", () => {
	it("marks the default chip with aria-pressed=true", () => {
		render(
			<StyleChips
				chips={CHIPS}
				defaultChipId="formal"
				selectedChipId="formal"
				recipientName="Dr. Chen"
				learnedCount={47}
				onSelect={() => {}}
				onRemember={() => {}}
			/>,
		);
		const defaultBtn = screen.getByRole("button", { name: /formal/i });
		expect(defaultBtn).toHaveAttribute("aria-pressed", "true");
	});

	it("shows 'learned from N emails' caption for the default chip", () => {
		render(
			<StyleChips
				chips={CHIPS}
				defaultChipId="formal"
				selectedChipId="formal"
				recipientName="Dr. Chen"
				learnedCount={47}
				onSelect={() => {}}
				onRemember={() => {}}
			/>,
		);
		expect(screen.getByText(/learned from 47 emails/i)).toBeInTheDocument();
	});

	it("shows 'Remember for <name>?' caption when a non-default chip is selected", () => {
		render(
			<StyleChips
				chips={CHIPS}
				defaultChipId="formal"
				selectedChipId="warm"
				recipientName="Dr. Chen"
				learnedCount={47}
				onSelect={() => {}}
				onRemember={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /remember for dr\. chen/i })).toBeInTheDocument();
	});

	it("calls onRemember with the selected chip id when graphAvailable and remember clicked", () => {
		const onRemember = vi.fn();
		render(
			<StyleChips
				chips={CHIPS}
				defaultChipId="formal"
				selectedChipId="warm"
				recipientName="Dr. Chen"
				learnedCount={47}
				graphAvailable={true}
				onSelect={() => {}}
				onRemember={onRemember}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /remember for dr\. chen/i }));
		expect(onRemember).toHaveBeenCalledWith("warm");
	});

	it("remember button is disabled (native) when graphAvailable is false", () => {
		render(
			<StyleChips
				chips={CHIPS}
				defaultChipId="formal"
				selectedChipId="warm"
				recipientName="Dr. Chen"
				learnedCount={47}
				onSelect={() => {}}
				onRemember={() => {}}
			/>,
		);
		const rememberBtn = screen.getByRole("button", { name: /remember for dr\. chen/i });
		expect(rememberBtn).toBeDisabled();
	});

	it("calls onSelect when a chip is clicked", () => {
		const onSelect = vi.fn();
		render(
			<StyleChips
				chips={CHIPS}
				defaultChipId="formal"
				selectedChipId="formal"
				recipientName="Dr. Chen"
				learnedCount={47}
				onSelect={onSelect}
				onRemember={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /concise/i }));
		expect(onSelect).toHaveBeenCalledWith("concise");
	});
});
