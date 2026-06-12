/**
 * LabelBar — AUTO-labels the open email. Fully FREE (Office.js categories + a
 * NaviGator classify call; no Microsoft Graph, no UFIT). When you open a
 * message it classifies it (To respond / Waiting / Meetings / FYI) and applies
 * the Outlook category automatically; the chips are the one-click override.
 * Bulk/background labeling of the whole inbox is the Graph-gated upgrade.
 */
import { useEffect, useState } from "react";
import { htmlToText } from "../graph/mail";
import { classifyLabel, type LabelDef, LABEL_DEFS } from "../intel/classifyLabel";
import { getNavKey } from "../llm/key";
import { DRAFT_MODEL } from "../llm/models";
import { chat } from "../llm/navigator";
import { labelOpenItem } from "../office/categories";
import type { OpenMessage } from "../office/context";
import { getOpenMessageBody } from "../office/mailItem";

interface LabelBarProps {
	message: OpenMessage | null;
}

export function LabelBar({ message }: LabelBarProps) {
	// LabelBar is keyed on the open message (DraftPanel), so it remounts per
	// email — fresh state, no in-effect resets needed. "Auto-labeling…" shows
	// immediately via lazy initial state when we'll auto-classify.
	const willAuto = !!message && getNavKey() !== null;
	const [applied, setApplied] = useState<string | null>(null);
	const [auto, setAuto] = useState(false);
	const [busy, setBusy] = useState<string | null>(willAuto ? "auto" : null);
	const [error, setError] = useState<string | null>(null);

	const APPLY_ERR = "Couldn’t apply the label in Outlook — try again.";
	const CLASSIFY_ERR =
		"Couldn’t classify this email — is your NaviGator key connected?";

	// Auto-classify + auto-apply the moment an email opens. Needs the NaviGator
	// key; silently does nothing without it (the chips still work as a manual
	// fallback). All setState runs AFTER an await (never synchronously here).
	useEffect(() => {
		if (!willAuto) return;
		let live = true;
		(async () => {
			try {
				const html = await getOpenMessageBody();
				const label = await classifyLabel(
					{ subject: message?.subject ?? "", body: htmlToText(html) },
					(o) => chat({ model: DRAFT_MODEL, system: o.system, user: o.user }),
				);
				if (!live) return;
				if (!label) {
					setBusy(null);
					return;
				}
				try {
					await labelOpenItem(label.name, label.color);
				} catch {
					if (live) setError(APPLY_ERR);
					return;
				}
				if (live) {
					setApplied(label.short);
					setAuto(true);
				}
			} catch {
				if (live) setError(CLASSIFY_ERR);
			} finally {
				if (live) setBusy(null);
			}
		})();
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [message?.internetMessageId]);

	async function applyManual(l: LabelDef) {
		setBusy(l.short);
		setError(null);
		try {
			await labelOpenItem(l.name, l.color);
			setApplied(l.short);
			setAuto(false);
		} catch {
			setError(APPLY_ERR);
		} finally {
			setBusy(null);
		}
	}

	if (!message) return null;

	const note =
		busy === "auto"
			? "Auto-labeling…"
			: applied
				? auto
					? `Auto-labeled “${applied}” — change below if wrong`
					: `Labeled “${applied}”`
				: "Auto-labels when you open an email · or pick one";

	return (
		<div className="card" style={{ marginTop: 12 }}>
			<span className="micro-label">Label</span>
			<p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
				{note}
			</p>
			<div className="tweak-row" style={{ marginTop: 6 }}>
				{LABEL_DEFS.map((l) => {
					const isApplied = applied === l.short;
					return (
						<button
							key={l.name}
							type="button"
							className="tweak-pill"
							style={
								isApplied
									? { borderColor: "var(--green)", color: "var(--green)" }
									: undefined
							}
							aria-pressed={isApplied}
							disabled={busy !== null}
							onClick={() => applyManual(l)}
						>
							{busy === l.short ? "…" : isApplied ? `✓ ${l.short}` : l.short}
						</button>
					);
				})}
			</div>
			{error && (
				<p
					style={{ fontSize: 11, color: "var(--amber)", marginTop: 6 }}
					role="alert"
				>
					{error}
				</p>
			)}
		</div>
	);
}
