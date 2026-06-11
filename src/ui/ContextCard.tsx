/**
 * ContextCard — shows what we know about the open email.
 * FREE: subject, sender name/title from Office.js mailbox.item.
 * GRAPH-GATED (shown but disabled): project match + status-card stage, relationship register.
 * Detected asks: free via the draft pipeline analysis (A2).
 */
import type { OpenMessage } from "../office/context";

interface ContextCardProps {
	message: OpenMessage | null;
	/** Predicted register from relationship card (Graph). Null in free mode. */
	predictedRegister: string | null;
	/** Detected asks from the draft pipeline (free). */
	asks: string[];
	/** Project name from corpus match (Graph). Null in free mode. */
	projectName: string | null;
}

export function ContextCard({
	message,
	predictedRegister,
	asks,
	projectName,
}: ContextCardProps) {
	if (!message) {
		return (
			<div className="card">
				<div className="ctx-head">
					<span className="micro-label">Understanding</span>
				</div>
				<p className="draft-empty">Open an email in Outlook to begin.</p>
			</div>
		);
	}

	return (
		<div className="card">
			<div className="ctx-head">
				<span className="micro-label">Understanding</span>
				<span className="sep" aria-hidden="true">
					·
				</span>
				<span className="micro">auto-read from thread</span>
			</div>

			{/* Recipient — FREE via Office.js */}
			<div className="ctx-row">
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
					<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
					<circle cx="12" cy="7" r="4" />
				</svg>
				<span>
					<span className="strong">
						{message.senderName || message.senderEmail}
					</span>
					{message.senderEmail && message.senderName && (
						<span style={{ color: "var(--ink-2)" }}>
							{" "}
							&lt;{message.senderEmail}&gt;
						</span>
					)}
				</span>
			</div>

			{/* Subject — FREE via Office.js */}
			<div className="ctx-row">
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
					<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
				</svg>
				<span>
					<span className="strong">{message.subject || "(no subject)"}</span>
					{projectName && <span className="gray-chip">{projectName}</span>}
				</span>
			</div>

			{/* Register — from relationship card (Graph). Show stub in free mode. */}
			<div className="ctx-row">
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
					<polyline points="4 7 4 4 20 4 20 7" />
					<line x1="9" y1="20" x2="15" y2="20" />
					<line x1="12" y1="4" x2="12" y2="20" />
				</svg>
				{predictedRegister ? (
					<span className="register-chip">{predictedRegister}</span>
				) : (
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 5,
							fontSize: 11,
							color: "var(--ink-3)",
						}}
					>
						<svg
							width="10"
							height="10"
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
						Register · needs Microsoft 365
					</span>
				)}
			</div>

			{/* Detected asks — populated by pipeline after draft (free) */}
			{asks.length > 0 && (
				<div className="asks">
					<span className="micro-label">Detected asks</span>
					{asks.map((ask) => (
						<div key={ask} className="ask-row">
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
							<span>{ask}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
