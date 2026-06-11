import { Component, type JSX, type ReactNode, useEffect, useRef } from "react";

// ---- Error Boundary --------------------------------------------------------

interface EBProps {
	children: ReactNode;
}
interface EBState {
	error: Error | null;
}

export class ErrorBoundary extends Component<EBProps, EBState> {
	state: EBState = { error: null };
	static getDerivedStateFromError(error: Error): EBState {
		return { error };
	}
	render() {
		if (this.state.error) {
			return (
				<div className="error-boundary" role="alert">
					<h3>Something went wrong</h3>
					<p>{this.state.error.message}</p>
					<button
						type="button"
						className="btn-sm-ghost"
						onClick={() => this.setState({ error: null })}
					>
						Retry
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}

// ---- Icons (lucide-style 1.5px inline SVG) ----------------------------------

function IconPen() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}
function IconInbox() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
			<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		</svg>
	);
}
function IconCalendar() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect x="3" y="4" width="18" height="18" rx="2" />
			<line x1="16" y1="2" x2="16" y2="6" />
			<line x1="8" y1="2" x2="8" y2="6" />
			<line x1="3" y1="10" x2="21" y2="10" />
		</svg>
	);
}
function IconSettings() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<line x1="4" y1="21" x2="4" y2="14" />
			<line x1="4" y1="10" x2="4" y2="3" />
			<line x1="12" y1="21" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12" y2="3" />
			<line x1="20" y1="21" x2="20" y2="16" />
			<line x1="20" y1="12" x2="20" y2="3" />
			<line x1="1" y1="14" x2="7" y2="14" />
			<line x1="9" y1="8" x2="15" y2="8" />
			<line x1="17" y1="16" x2="23" y2="16" />
		</svg>
	);
}
function IconLock() {
	return (
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
	);
}

// ---- Tab types --------------------------------------------------------------

export type TabId = "draft" | "triage" | "meetings" | "settings";

const TABS: { id: TabId; label: string; icon: () => JSX.Element }[] = [
	{ id: "draft", label: "Draft", icon: IconPen },
	{ id: "triage", label: "Triage", icon: IconInbox },
	{ id: "meetings", label: "Meetings", icon: IconCalendar },
	{ id: "settings", label: "Settings", icon: IconSettings },
];

// ---- AppShell ---------------------------------------------------------------

interface AppShellProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
	onOpenSettings: () => void;
	children: ReactNode;
}

export function AppShell({
	activeTab,
	onTabChange,
	onOpenSettings,
	children,
}: AppShellProps) {
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const indicatorRef = useRef<HTMLSpanElement | null>(null);

	function positionIndicator() {
		const activeIdx = TABS.findIndex((t) => t.id === activeTab);
		const btn = tabRefs.current[activeIdx];
		const indicator = indicatorRef.current;
		if (!btn || !indicator) return;
		indicator.style.left = `${btn.offsetLeft + 10}px`;
		indicator.style.width = `${btn.offsetWidth - 20}px`;
	}

	useEffect(() => {
		positionIndicator();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab]);

	function handleKeyDown(e: React.KeyboardEvent, idx: number) {
		let next: number | null = null;
		if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
		else if (e.key === "ArrowLeft")
			next = (idx - 1 + TABS.length) % TABS.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = TABS.length - 1;
		if (next !== null) {
			e.preventDefault();
			onTabChange(TABS[next].id);
			tabRefs.current[next]?.focus();
		}
	}

	return (
		<div className="pane">
			{/* Header */}
			<div className="pane-head">
				<div className="logomark" aria-hidden="true">
					G
				</div>
				<div className="brand">
					<span className="brand-name">Glean</span>
					<span className="brand-sub">for Outlook</span>
				</div>
				<div className="head-right">
					<span className="privacy-pill">
						<span className="dot" aria-hidden="true" />
						<span>Private · on-device</span>
					</span>
					<button
						type="button"
						className="icon-btn"
						aria-label="Settings"
						onClick={onOpenSettings}
					>
						<IconSettings />
					</button>
				</div>
			</div>

			{/* Tab bar */}
			<div className="tabs" role="tablist" aria-label="Glean sections">
				{TABS.map((tab, i) => {
					const Icon = tab.icon;
					const selected = tab.id === activeTab;
					return (
						<button
							key={tab.id}
							type="button"
							ref={(el) => {
								tabRefs.current[i] = el;
							}}
							className="tab"
							role="tab"
							id={`tab-${tab.id}`}
							aria-controls={`panel-${tab.id}`}
							aria-selected={selected}
							tabIndex={selected ? 0 : -1}
							onClick={() => onTabChange(tab.id)}
							onKeyDown={(e) => handleKeyDown(e, i)}
						>
							<Icon />
							{tab.label}
						</button>
					);
				})}
				<span ref={indicatorRef} className="tab-indicator" aria-hidden="true" />
			</div>

			{/* Content panels */}
			<div className="content" id="content">
				{children}
			</div>

			{/* Footer */}
			<div className="pane-foot">
				<IconLock />
				<span>
					Nothing leaves this device — drafts run on UF NaviGator only.
				</span>
			</div>
		</div>
	);
}

// ---- Panel wrapper ----------------------------------------------------------

interface PanelProps {
	id: TabId;
	activeTab: TabId;
	children: ReactNode;
}

export function Panel({ id, activeTab, children }: PanelProps) {
	const isActive = id === activeTab;
	return (
		<>
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex=0 is required on role=tabpanel per ARIA spec */}
			<section
				className={`panel${isActive ? " active" : ""}`}
				role="tabpanel"
				id={`panel-${id}`}
				aria-labelledby={`tab-${id}`}
				tabIndex={0}
				hidden={!isActive}
			>
				{isActive ? children : null}
			</section>
		</>
	);
}

