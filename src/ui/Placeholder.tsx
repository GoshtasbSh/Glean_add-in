/** Placeholder panel for tabs that need Microsoft Graph (UFIT approval pending). */
interface PlaceholderProps {
	title: string;
	/** If true, show the Graph-required lock badge instead of "coming in A5". */
	requiresGraph?: boolean;
	/** Session milestone note shown below the lock (e.g. "coming in SESSION A5"). */
	milestone?: string;
}

export function Placeholder({
	title,
	requiresGraph = false,
	milestone,
}: PlaceholderProps) {
	return (
		<div className="placeholder-panel">
			{requiresGraph ? (
				<svg
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.25"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			) : (
				<svg
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.25"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			)}
			<p style={{ fontWeight: 600, color: "var(--ink-2)" }}>{title}</p>
			{requiresGraph && (
				<p>Requires Microsoft 365 connection · pending UFIT approval</p>
			)}
			{milestone && <span className="mono-micro">{milestone}</span>}
		</div>
	);
}
