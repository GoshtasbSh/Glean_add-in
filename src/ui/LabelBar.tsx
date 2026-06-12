/**
 * LabelBar — AUTO-labels the open email into one of the user's labels (free:
 * Office.js categories + a NaviGator classify call; no Graph, no UFIT). Opening
 * a message classifies it and applies the matching Outlook category; the chips
 * are a one-click override. The label set is user-editable (Settings → Labels).
 * Applying needs a matching Outlook category to exist (free can't create them).
 */
import { useEffect, useState } from "react";
import { htmlToText } from "../graph/mail";
import { classifyLabel } from "../intel/classifyLabel";
import { getNavKey } from "../llm/key";
import { DRAFT_MODEL } from "../llm/models";
import { chat } from "../llm/navigator";
import { labelOpenItem } from "../office/categories";
import type { OpenMessage } from "../office/context";
import { getOpenMessageBody } from "../office/mailItem";
import { getLabels, type UserLabel } from "../store/labels";

interface LabelBarProps {
	message: OpenMessage | null;
}

export function LabelBar({ message }: LabelBarProps) {
	const [labels] = useState(getLabels);
	const willAuto = !!message && getNavKey() !== null && labels.length > 0;
	const [applied, setApplied] = useState<string | null>(null);
	const [auto, setAuto] = useState(false);
	const [busy, setBusy] = useState<string | null>(willAuto ? "auto" : null);
	const [error, setError] = useState<string | null>(null);

	const applyErr = (label: string) =>
		`Couldn’t apply “${label}”. Create an Outlook category named “${label}” once ` +
		`(right-click an email → Categorize → New Category), then try again.`;
	const detail = (e: unknown) =>
		e instanceof Error && e.message ? e.message : "unknown error";

	useEffect(() => {
		if (!willAuto) return;
		let live = true;
		(async () => {
			try {
				const html = await getOpenMessageBody();
				const label = await classifyLabel(
					{ subject: message?.subject ?? "", body: htmlToText(html) },
					labels,
					(o) => chat({ model: DRAFT_MODEL, system: o.system, user: o.user }),
				);
				if (!live) return;
				if (!label) {
					setBusy(null);
					return;
				}
				try {
					await labelOpenItem(label.name);
				} catch {
					if (live) setError(applyErr(label.name));
					return;
				}
				if (live) {
					setApplied(label.name);
					setAuto(true);
				}
			} catch (e) {
				if (live) setError(`Couldn’t classify (key/network?): ${detail(e)}`);
			} finally {
				if (live) setBusy(null);
			}
		})();
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [message?.internetMessageId]);

	async function applyManual(label: UserLabel) {
		setBusy(label.name);
		setError(null);
		try {
			await labelOpenItem(label.name);
			setApplied(label.name);
			setAuto(false);
		} catch {
			setError(applyErr(label.name));
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
				{labels.map((l) => {
					const isApplied = applied === l.name;
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
							{busy === l.name ? "…" : isApplied ? `✓ ${l.name}` : l.name}
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
