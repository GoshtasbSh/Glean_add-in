import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VerifierBanner } from "../../src/ui/VerifierBanner";

describe("VerifierBanner", () => {
	it("shows green pass state with check count when passed=true", () => {
		render(<VerifierBanner passed={true} reasons={[]} onUseAnyway={() => {}} onFix={() => {}} />);
		expect(screen.getByRole("region")).toHaveClass("pass");
		expect(screen.queryByRole("button", { name: /use anyway/i })).toBeNull();
	});

	it("shows amber fail state with reasons when passed=false", () => {
		render(
			<VerifierBanner
				passed={false}
				reasons={["hallucination (high): invented date", "banned phrase: \"per my last email\""]}
				onUseAnyway={() => {}}
				onFix={() => {}}
			/>,
		);
		const region = screen.getByRole("region");
		expect(region).toHaveClass("fail");
		expect(screen.getByText(/hallucination/)).toBeInTheDocument();
		expect(screen.getByText(/banned phrase/)).toBeInTheDocument();
	});

	it("renders 'Use anyway' button on fail and fires onUseAnyway", () => {
		const onUseAnyway = vi.fn();
		render(
			<VerifierBanner passed={false} reasons={["some issue"]} onUseAnyway={onUseAnyway} onFix={() => {}} />,
		);
		const btn = screen.getByRole("button", { name: /use anyway/i });
		fireEvent.click(btn);
		expect(onUseAnyway).toHaveBeenCalledTimes(1);
	});

	it("renders 'Fix it' button on fail and fires onFix", () => {
		const onFix = vi.fn();
		render(
			<VerifierBanner passed={false} reasons={["some issue"]} onUseAnyway={() => {}} onFix={onFix} />,
		);
		const btn = screen.getByRole("button", { name: /fix it/i });
		fireEvent.click(btn);
		expect(onFix).toHaveBeenCalledTimes(1);
	});

	it("does not render 'Use anyway' or 'Fix it' when passed=true", () => {
		render(<VerifierBanner passed={true} reasons={[]} onUseAnyway={() => {}} onFix={() => {}} />);
		expect(screen.queryByRole("button", { name: /use anyway/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /fix it/i })).toBeNull();
	});
});
