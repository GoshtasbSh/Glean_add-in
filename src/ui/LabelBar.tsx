/**
 * LabelBar — label/categorize the OPEN email. Fully FREE (Office.js Outlook
 * categories: no Microsoft Graph, no token, no UFIT). Bulk/auto inbox labeling
 * is the Graph-gated upgrade; this is the per-open-message free path.
 */
import { useState } from "react";
import { labelOpenItem } from "../office/categories";
import type { OpenMessage } from "../office/context";

const LABELS: { name: string; short: string; color: string }[] = [
	{ name: "Glean/To respond", short: "To respond", color: "preset0" },
	{ name: "Glean/FYI", short: "FYI", color: "preset3" },
	{ name: "Glean/Waiting", short: "Waiting", color: "preset6" },
	{ name: "Glean/Meetings", short: "Meetings", color: "preset5" },
];

interface LabelBarProps {
	message: OpenMessage | null;
}

export function LabelBar({ message }: LabelBarProps) {
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(
		null,
	);

	if (!message) return null;

	async function apply(label: (typeof LABELS)[number]) {
		setBusy(label.name);
		setStatus(null);
		try {
			await labelOpenItem(label.name, label.color);
			setStatus({ text: `Labeled “${label.short}”`, ok: true });
		} catch {
			setStatus({ text: "Couldn’t apply the label — try again.", ok: false });
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="card" style={{ marginTop: 12 }}>
			<span className="micro-label">Label this email</span>
			<div className="tweak-row" style={{ marginTop: 8 }}>
				{LABELS.map((l) => (
					<button
						key={l.name}
						type="button"
						className="tweak-pill"
						disabled={busy !== null}
						onClick={() => apply(l)}
					>
						{busy === l.name ? "…" : l.short}
					</button>
				))}
			</div>
			{status && (
				<p
					style={{
						fontSize: 11,
						marginTop: 6,
						color: status.ok ? "var(--green)" : "var(--amber)",
					}}
					role="status"
				>
					{status.text}
				</p>
			)}
		</div>
	);
}
