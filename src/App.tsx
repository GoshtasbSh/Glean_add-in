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
import { useState } from "react";
import GraphDemo from "./GraphDemo";
import { getNavKey } from "./llm/key";
import { getOpenMessage } from "./office/context";
import { AppShell, ErrorBoundary, Panel, type TabId } from "./ui/AppShell";
import { DraftPanel } from "./ui/DraftPanel";
import { KeyScreen } from "./ui/KeyScreen";
import { Onboarding } from "./ui/Onboarding";
import { Placeholder } from "./ui/Placeholder";
import { Settings } from "./ui/Settings";

export default function App() {
	const useGraph =
		typeof window !== "undefined" && window.location.search.includes("graph");
	if (useGraph) return <GraphDemo />;

	return <GleanPane />;
}

function GleanPane() {
	const [hasKey, setHasKey] = useState(() => getNavKey() !== null);
	const [onboardingDone, setOnboardingDone] = useState(
		() => getNavKey() !== null,
	);
	const [activeTab, setActiveTab] = useState<TabId>("draft");
	const message = getOpenMessage();

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
					<DraftPanel message={message} />
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
