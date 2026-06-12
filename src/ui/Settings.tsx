/**
 * Settings tab.
 *
 * FREE sections (no Graph needed):
 *   - NaviGator API key (sessionStorage, key.ts)
 *
 * GRAPH-GATED sections (locked until UFIT approval):
 *   - Voice profile / Refit  — needs Mail.Read (1500 sent msgs) + OneDrive
 *   - Labels & rules         — labels via Office.js masterCategories are free,
 *                              but rule syncing to OneDrive needs Graph
 *   - Catch-up               — needs Mail.Read bulk scan
 */
import { useState } from "react";
import {
	clearNavKey,
	getNavKey,
	KeyValidationError,
	setNavKey,
} from "../llm/key";
import { LabelSettings } from "./LabelSettings";
import { MsGateRow } from "./MsGate";
import { TrainVoice } from "./TrainVoice";

interface SettingsProps {
	onKeyCleared: () => void;
}

export function Settings({ onKeyCleared }: SettingsProps) {
	const hasKey = getNavKey() !== null;
	const [keyInput, setKeyInput] = useState("");
	const [validating, setValidating] = useState(false);
	const [keyMsg, setKeyMsg] = useState<{ text: string; ok: boolean } | null>(
		null,
	);

	async function handleValidate() {
		const trimmed = keyInput.trim();
		if (!trimmed) return;
		setValidating(true);
		setKeyMsg(null);
		try {
			const { count } = await setNavKey(trimmed);
			setKeyMsg({ text: `Connected · ${count} models`, ok: true });
			setKeyInput("");
		} catch (e) {
			setKeyMsg({
				text:
					e instanceof KeyValidationError ? e.message : "Could not validate.",
				ok: false,
			});
		} finally {
			setValidating(false);
		}
	}

	function handleClear() {
		clearNavKey();
		setKeyMsg({ text: "Key cleared — enter a new key below.", ok: false });
		onKeyCleared();
	}

	return (
		<div style={{ paddingBottom: 24 }}>
			{/* ---- Connection (FREE) ---- */}
			<div className="settings-group">
				<span className="micro-label">Connection</span>
				<div className="settings-card">
					<div className="setting-row" style={{ cursor: "default" }}>
						<span className="setting-name">NaviGator API key</span>
						{hasKey && (
							<span className="setting-value">
								<span className="dot" aria-hidden="true" />
								Connected
							</span>
						)}
					</div>
					<div
						style={{
							padding: "10px 12px",
							background: "var(--surface-2)",
							borderTop: "1px solid var(--hairline-soft)",
							display: "flex",
							flexDirection: "column",
							gap: 8,
						}}
					>
						<div className="key-input-row">
							<input
								className="key-input"
								type="password"
								value={keyInput}
								onChange={(e) => setKeyInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void handleValidate();
								}}
								placeholder={hasKey ? "Replace key…" : "Paste NaviGator key…"}
								aria-label="NaviGator API key"
								autoComplete="off"
								spellCheck={false}
							/>
							<button
								type="button"
								className={`validate-btn${keyMsg?.ok ? " ok" : ""}`}
								onClick={handleValidate}
								disabled={!keyInput.trim() || validating}
							>
								{validating ? "…" : keyMsg?.ok ? "Valid ✓" : "Validate"}
							</button>
						</div>
						{keyMsg && (
							<p
								style={{
									fontSize: 11,
									color: keyMsg.ok ? "var(--green)" : "var(--amber)",
								}}
								role={keyMsg.ok ? "status" : "alert"}
							>
								{keyMsg.text}
							</p>
						)}
						{hasKey && (
							<button
								type="button"
								style={{
									fontSize: 11,
									color: "var(--ink-3)",
									alignSelf: "flex-start",
									padding: "2px 0",
								}}
								onClick={handleClear}
							>
								Sign out / clear key
							</button>
						)}
						<p className="key-session-note">
							Your key is saved in your own UF mailbox so you don't re-enter it —
							never on any developer server. Clear it with "Sign out / clear key".
						</p>
					</div>
				</div>
			</div>

			{/* ---- Voice (FREE — manual upload, no Graph/UFIT) ---- */}
			<TrainVoice />

			{/* ---- Labels (FREE — user-editable taxonomy) ---- */}
			<LabelSettings />

			{/* ---- Intelligence (GRAPH-GATED) ---- */}
			<div className="settings-group">
				<span className="micro-label">Intelligence</span>
				<div className="settings-card">
					<MsGateRow feature="Auto-refit voice from full sent history" />
					<MsGateRow feature="Labels & rules sync" />
					<MsGateRow feature="Catch-up now" />
				</div>
			</div>

			{/* ---- About ---- */}
			<div className="settings-group">
				<span className="micro-label">About</span>
				<div className="settings-card">
					<div
						className="setting-row"
						style={{
							cursor: "default",
							flexDirection: "column",
							alignItems: "flex-start",
							gap: 4,
						}}
					>
						<span className="setting-name">Local Glean for Outlook</span>
						<span style={{ fontSize: 11, color: "var(--ink-3)" }}>
							v1.0.0 · build {__APP_BUILD__} · NaviGator-only · FERPA-safe
						</span>
					</div>
					<div className="setting-row" style={{ cursor: "default" }}>
						<span
							className="setting-name"
							style={{ fontWeight: 400, color: "var(--ink-2)" }}
						>
							Microsoft 365 features
						</span>
						<span className="ms-gate-pill">Pending UFIT</span>
					</div>
				</div>
			</div>
		</div>
	);
}
