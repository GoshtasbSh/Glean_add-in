/**
 * MsGate — wraps any feature that requires Microsoft Graph (UFIT admin consent).
 * Shows the feature visually but disabled with a "Microsoft 365 required" badge.
 * Once UFIT approval lands, remove this wrapper and wire the real data source.
 *
 * Free features (Office.js only) must NOT be wrapped in this component.
 */
import type { ReactNode } from "react";

interface MsGateProps {
	/** Short label shown in the badge, e.g. "Voice profile", "Triage" */
	feature: string;
	children: ReactNode;
}

export function MsGate({ feature, children }: MsGateProps) {
	return (
		<div
			className="ms-gate"
			role="region"
			aria-label={`${feature} — requires Microsoft 365 connection`}
		>
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: inert+aria-hidden disables content for AT */}
			<div className="ms-gate-content" aria-hidden="true" inert>
				{children}
			</div>
			<div className="ms-gate-badge" role="note">
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.75"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				<span>
					<strong>{feature}</strong> requires Microsoft 365 connection
					<span className="ms-gate-sub"> · pending UFIT approval</span>
				</span>
			</div>
		</div>
	);
}

/** Inline locked-row variant for use inside settings cards */
export function MsGateRow({ feature }: { feature: string }) {
	return (
		<div
			className="ms-gate-row"
			role="note"
			aria-label={`${feature} — requires Microsoft 365 connection`}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<rect x="3" y="11" width="18" height="11" rx="2" />
				<path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
			<span>{feature}</span>
			<span className="ms-gate-pill">Needs Microsoft 365</span>
		</div>
	);
}
