/**
 * KeyScreen — NaviGator API key entry/validation. Fully FREE (no Graph).
 * Key saved in the user's OWN UF mailbox (roaming settings) + session — never
 * localStorage, never any developer server; clearable anytime in Settings.
 * Shown on first-run and in Settings; also surfaced when NeedsKeyError fires mid-draft.
 */
import { useState } from "react";
import { KeyValidationError, setNavKey } from "../llm/key";

interface KeyScreenProps {
	onConnected: () => void;
	/** If true, shown inline (e.g. re-prompt after NeedsKeyError); else full screen. */
	inline?: boolean;
}

export function KeyScreen({ onConnected, inline = false }: KeyScreenProps) {
	const [keyInput, setKeyInput] = useState("");
	const [validating, setValidating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	async function handleValidate() {
		const trimmed = keyInput.trim();
		if (!trimmed) return;
		setValidating(true);
		setError(null);
		setSuccess(null);
		try {
			const { count } = await setNavKey(trimmed);
			setSuccess(`Connected — ${count} models available`);
			setKeyInput("");
			onConnected();
		} catch (e) {
			setError(
				e instanceof KeyValidationError
					? e.message
					: "Could not validate the key.",
			);
		} finally {
			setValidating(false);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") void handleValidate();
	}

	const content = (
		<div className="key-screen">
			<h3>Connect NaviGator</h3>
			<p>
				Paste your UF NaviGator API key below. Glean will call NaviGator
				directly from your browser. Your key is saved in your own UF mailbox so you
				don't re-enter it next time — it never touches any developer server,
				and you can clear it anytime in Settings.
			</p>
			<div className="key-input-row">
				<input
					className="key-input"
					type="password"
					value={keyInput}
					onChange={(e) => setKeyInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="NaviGator API key"
					aria-label="NaviGator API key"
					autoComplete="off"
					spellCheck={false}
				/>
				<button
					type="button"
					className={`validate-btn${success ? " ok" : ""}`}
					onClick={handleValidate}
					disabled={!keyInput.trim() || validating}
				>
					{validating ? "…" : success ? "Valid ✓" : "Validate"}
				</button>
			</div>
			{error && (
				<p className="key-error" role="alert">
					{error}
				</p>
			)}
			{success && (
				<p className="key-success" role="status">
					{success}
				</p>
			)}
			<div className="key-session-note" role="note">
				🔒 Your key is saved in your own UF mailbox (never on any developer
				server) so you don't re-enter it. Clear it anytime with "Sign out / clear key".
			</div>
		</div>
	);

	if (inline) return content;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				flex: 1,
				justifyContent: "center",
			}}
		>
			{content}
		</div>
	);
}
