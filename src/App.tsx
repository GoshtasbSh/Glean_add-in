/**
 * App — production pane UI (SESSION A4, Porcelain design).
 * Replaces the temporary FreeMode + GraphDemo split from A1–A3.
 *
 * FREE features (Office.js only, no UFIT needed):
 *   - NaviGator key onboarding + key management
 *   - Read open email + draft in voice + insert into reply
 *   - Categories on open item via Office.js masterCategories
 *
 * GRAPH-GATED (visible, disabled, pending UFIT approval):
 *   - Voice onboarding (scan sent mail), relationship cards, project corpus
 *   - Triage + Meetings tabs, rules sync, refit, catch-up
 *
 * The ?graph query param still routes to GraphDemo for testing the Graph path
 * once UFIT approval lands (retained per A1 convention).
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { getNavKey } from "./llm/key";
import { getOpenMessage, type OpenMessage } from "./office/context";
import { AppShell, ErrorBoundary, Panel, type TabId } from "./ui/AppShell";
import { DraftPanel } from "./ui/DraftPanel";
import { KeyScreen } from "./ui/KeyScreen";
import { Onboarding } from "./ui/Onboarding";
import { Placeholder } from "./ui/Placeholder";
import { Settings } from "./ui/Settings";

// The Graph/MSAL pane is DEV-only and code-split into its own chunk: the
// production FREE build never loads it, so no Microsoft Graph or login code
// runs or is fetched on the shipped runtime path (custody — security review).
// The post-UFIT upgrade build re-enables it behind its own manifest + CSP.
const GraphDemo = lazy(() => import("./GraphDemo"));

export default function App() {
	const wantGraph =
		typeof window !== "undefined" && window.location.search.includes("graph");
	if (import.meta.env.DEV && wantGraph) {
		return (
			<Suspense fallback={<div className="pane" />}>
				<GraphDemo />
			</Suspense>
		);
	}

	return <GleanPane />;
}

function GleanPane() {
	const [hasKey, setHasKey] = useState(() => getNavKey() !== null);
	const [onboardingDone, setOnboardingDone] = useState(
		() => getNavKey() !== null,
	);
	const [activeTab, setActiveTab] = useState<TabId>("draft");
	const [message, setMessage] = useState<OpenMessage | null>(getOpenMessage);

	// When the pane is pinned, Outlook fires ItemChanged as the user moves
	// between emails WITHOUT remounting us. Re-read the open item so the Draft
	// tab never drafts against a stale message (correctness — review finding).
	useEffect(() => {
		if (typeof Office === "undefined") return;
		const mailbox = Office.context?.mailbox;
		if (!mailbox?.addHandlerAsync) return;
		const handler = () => setMessage(getOpenMessage());
		mailbox.addHandlerAsync(Office.EventType.ItemChanged, handler);
		return () => {
			mailbox.removeHandlerAsync?.(Office.EventType.ItemChanged, handler);
		};
	}, []);

	// First run: no key → show onboarding
	if (!onboardingDone) {
		return (
			<div className="pane" style={{ justifyContent: "center" }}>
				<Onboarding
					onComplete={() => {
						setHasKey(true);
						setOnboardingDone(true);
					}}
				/>
			</div>
		);
	}

	// Key was cleared from settings → show inline key screen
	if (!hasKey) {
		return (
			<div className="pane" style={{ justifyContent: "center" }}>
				<KeyScreen onConnected={() => setHasKey(true)} />
			</div>
		);
	}

	return (
		<ErrorBoundary>
			<AppShell
				activeTab={activeTab}
				onTabChange={setActiveTab}
				onOpenSettings={() => setActiveTab("settings")}
			>
				<Panel id="draft" activeTab={activeTab}>
					{/* keyed on the open message: switching emails resets draft state
					    instead of carrying the previous email's draft over */}
					<DraftPanel
						key={message?.internetMessageId || "none"}
						message={message}
					/>
				</Panel>

				<Panel id="triage" activeTab={activeTab}>
					<Placeholder
						title="Triage"
						requiresGraph={true}
						milestone="Email sorting · pending UFIT approval"
					/>
				</Panel>

				<Panel id="meetings" activeTab={activeTab}>
					<Placeholder
						title="Meetings"
						requiresGraph={true}
						milestone="Calendar + Whisper · coming in SESSION A5 · pending UFIT"
					/>
				</Panel>

				<Panel id="settings" activeTab={activeTab}>
					<Settings onKeyCleared={() => setHasKey(false)} />
				</Panel>
			</AppShell>
		</ErrorBoundary>
	);
}
