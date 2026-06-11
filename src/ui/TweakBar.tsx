/** TweakBar — Shorter / Warmer / More detail / Regenerate. Fully FREE. */
import type { JSX } from "react";
import type { DraftRequest } from "../draft/pipeline";

interface TweakBarProps {
	disabled: boolean;
	onTweak: (tweak: DraftRequest["tweak"] | undefined) => void;
}

const TWEAKS: {
	label: string;
	tweak: DraftRequest["tweak"] | undefined;
	icon?: JSX.Element;
}[] = [
	{ label: "Shorter", tweak: "shorter" },
	{ label: "Warmer", tweak: "warmer" },
	{ label: "More detail", tweak: "detail" },
	{
		label: "Regenerate",
		tweak: undefined,
		icon: (
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<polyline points="23 4 23 10 17 10" />
				<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
			</svg>
		),
	},
];

export function TweakBar({ disabled, onTweak }: TweakBarProps) {
	return (
		<div className="tweak-row">
			{TWEAKS.map(({ label, tweak, icon }) => (
				<button
					key={label}
					type="button"
					className="tweak-pill"
					disabled={disabled}
					onClick={() => onTweak(tweak)}
				>
					{icon}
					{label}
				</button>
			))}
		</div>
	);
}
