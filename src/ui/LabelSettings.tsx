/**
 * LabelSettings — manage the user's label set (Settings → Labels). FREE: the
 * set is saved in the user's own mailbox (roaming settings) and used by the
 * auto-classifier. Each label also needs a matching Outlook category to actually
 * show on a message (the free permission can't create categories).
 */
import { useState } from "react";
import { getLabels, saveLabels, type UserLabel } from "../store/labels";

export function LabelSettings() {
	const [labels, setLabels] = useState<UserLabel[]>(getLabels);
	const [name, setName] = useState("");
	const [desc, setDesc] = useState("");
	const [busy, setBusy] = useState(false);

	async function persist(next: UserLabel[]) {
		setLabels(next);
		setBusy(true);
		try {
			await saveLabels(next);
		} finally {
			setBusy(false);
		}
	}

	async function add() {
		const n = name.trim();
		if (!n) return;
		if (labels.some((l) => l.name.toLowerCase() === n.toLowerCase())) {
			setName("");
			setDesc("");
			return;
		}
		await persist([...labels, { name: n, desc: desc.trim() || n }]);
		setName("");
		setDesc("");
	}

	return (
		<div className="settings-group">
			<span className="micro-label">Labels · auto-classification</span>
			<div className="settings-card">
				<div
					style={{ padding: "10px 12px", fontSize: 11, color: "var(--ink-3)" }}
				>
					Emails are auto-sorted into these when you open them — add your own.
					Each label also needs an Outlook category of the same name to appear
					on the message (create it once: Categorize → New Category).
				</div>

				{labels.map((l) => (
					<div
						key={l.name}
						className="setting-row"
						style={{ cursor: "default" }}
					>
						<span className="setting-name">{l.name}</span>
						<button
							type="button"
							className="link-btn"
							disabled={busy}
							onClick={() => persist(labels.filter((x) => x.name !== l.name))}
						>
							Remove
						</button>
					</div>
				))}

				<div
					style={{
						padding: "10px 12px",
						display: "flex",
						flexDirection: "column",
						gap: 6,
						borderTop: "1px solid var(--hairline-soft)",
					}}
				>
					<input
						className="key-input"
						placeholder="New label name (e.g. Finance)"
						aria-label="New label name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void add();
						}}
					/>
					<input
						className="key-input"
						placeholder="What it means (helps the AI sort it)"
						aria-label="New label description"
						value={desc}
						onChange={(e) => setDesc(e.target.value)}
					/>
					<button
						type="button"
						className="validate-btn"
						onClick={add}
						disabled={!name.trim() || busy}
					>
						Add label
					</button>
				</div>
			</div>
		</div>
	);
}
