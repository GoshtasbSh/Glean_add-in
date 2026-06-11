/**
 * Free-mode pane — works inside Outlook with NO Microsoft Graph, NO Entra
 * registration, NO admin consent. Read the open email -> draft a reply in your
 * voice (NaviGator) -> insert it (you send) -> label it. Everything runs in the
 * browser sandbox + your own mailbox; nothing is stored by anyone else.
 *
 * Ugly is fine here; a later session does the real design.
 */
import { type CSSProperties, useState } from "react";
import { createFreeDraftDeps } from "./draft/freeDeps";
import { type DraftResult, runDraft } from "./draft/pipeline";
import { getNavKey, KeyValidationError, setNavKey } from "./llm/key";
import { labelOpenItem } from "./office/categories";
import { getOpenMessage, type OpenMessage } from "./office/context";
import { insertReply } from "./office/reply";

const box: CSSProperties = {
	border: "1px solid #d0d0d0",
	borderRadius: 8,
	padding: 12,
	marginBottom: 12,
};
const btn: CSSProperties = {
	padding: "6px 12px",
	borderRadius: 6,
	border: "1px solid #0a5",
	background: "#0a5",
	color: "white",
	cursor: "pointer",
};

const LABELS: { name: string; color: string }[] = [
	{ name: "Glean/To respond", color: "preset0" },
	{ name: "Glean/FYI", color: "preset3" },
	{ name: "Glean/Waiting", color: "preset6" },
	{ name: "Glean/Meetings", color: "preset5" },
];

export default function FreeMode() {
	const [msg] = useState<OpenMessage | null>(() => getOpenMessage());
	const [hasKey, setHasKey] = useState<boolean>(() => getNavKey() !== null);
	const [keyInput, setKeyInput] = useState("");
	const [keyMsg, setKeyMsg] = useState("");

	const [draft, setDraft] = useState("");
	const [drafting, setDrafting] = useState(false);
	const [verifier, setVerifier] = useState<DraftResult["verifier"] | null>(
		null,
	);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");

	async function saveKey() {
		setKeyMsg("Validating…");
		try {
			const { count } = await setNavKey(keyInput.trim());
			setHasKey(true);
			setKeyInput("");
			setKeyMsg(`Connected to NaviGator (${count} models).`);
		} catch (e) {
			setKeyMsg(
				e instanceof KeyValidationError
					? e.message
					: "Could not validate the key.",
			);
		}
	}

	async function handleDraft() {
		if (!msg) return;
		setError("");
		setVerifier(null);
		setDraft("");
		setDrafting(true);
		try {
			const deps = createFreeDraftDeps();
			const result = await runDraft({ message: msg }, deps, (delta) =>
				setDraft((d) => d + delta),
			);
			setDraft(result.text);
			setVerifier(result.verifier);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Draft failed");
		} finally {
			setDrafting(false);
		}
	}

	function handleInsert() {
		setError("");
		try {
			insertReply(draft);
			setStatus(
				"Draft inserted into the reply — review it and click Send in Outlook.",
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Insert failed");
		}
	}

	async function handleLabel(name: string, color: string) {
		setError("");
		try {
			await labelOpenItem(name, color);
			setStatus(`Labeled “${name}”.`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Label failed");
		}
	}

	return (
		<div
			style={{
				padding: 16,
				fontFamily: "system-ui, sans-serif",
				fontSize: 14,
				color: "#222",
			}}
		>
			<h2 style={{ marginTop: 0 }}>Local Glean</h2>

			{!hasKey && (
				<div style={box}>
					<strong>Connect NaviGator (one-time, this session)</strong>
					<p style={{ color: "#555" }}>
						Paste your UF NaviGator API key. It stays in this session only and
						is never stored or logged.
					</p>
					<input
						type="password"
						value={keyInput}
						onChange={(e) => setKeyInput(e.target.value)}
						placeholder="NaviGator API key"
						style={{ width: "70%", padding: 6 }}
					/>{" "}
					<button
						type="button"
						style={btn}
						onClick={saveKey}
						disabled={!keyInput.trim()}
					>
						Connect
					</button>
					{keyMsg && <p style={{ color: "#555" }}>{keyMsg}</p>}
				</div>
			)}

			<div style={box}>
				<strong>This email</strong>
				{msg ? (
					<ul style={{ margin: "6px 0" }}>
						<li>Subject: {msg.subject}</li>
						<li>
							From: {msg.senderName} &lt;{msg.senderEmail}&gt;
						</li>
					</ul>
				) : (
					<p style={{ color: "#777" }}>Open an email in Outlook to begin.</p>
				)}
			</div>

			<div style={box}>
				<strong>Reply in your voice</strong>
				<p>
					<button
						type="button"
						style={{ ...btn, opacity: !msg || !hasKey || drafting ? 0.5 : 1 }}
						onClick={handleDraft}
						disabled={!msg || !hasKey || drafting}
					>
						{drafting ? "Drafting…" : "Draft reply in my voice"}
					</button>
				</p>
				{draft && (
					<>
						<textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							rows={12}
							style={{
								width: "100%",
								padding: 8,
								fontFamily: "inherit",
								fontSize: 13,
							}}
						/>
						{verifier && !verifier.passed && (
							<div style={{ color: "#b00020", fontSize: 12, marginTop: 4 }}>
								⚠ Verifier flagged this draft — review before sending:
								<ul>
									{verifier.reasons.map((r) => (
										<li key={r}>{r}</li>
									))}
								</ul>
							</div>
						)}
						<p>
							<button
								type="button"
								style={btn}
								onClick={handleInsert}
								disabled={!msg}
							>
								Insert into reply
							</button>
						</p>
					</>
				)}
			</div>

			<div style={box}>
				<strong>Label this email</strong>
				<div
					style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}
				>
					{LABELS.map((l) => (
						<button
							key={l.name}
							type="button"
							style={{ ...btn, background: "#345", border: "1px solid #345" }}
							onClick={() => handleLabel(l.name, l.color)}
							disabled={!msg}
						>
							{l.name.replace("Glean/", "")}
						</button>
					))}
				</div>
			</div>

			{status && <p style={{ color: "#0a5" }}>{status}</p>}
			{error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
		</div>
	);
}
