/** DraftView — streaming draft body with spinner/check status. Fully FREE. */
import type { DraftStreamStatus } from "../hooks/useDraftStream";

interface DraftViewProps {
	text: string;
	status: DraftStreamStatus;
	errorMessage: string | null;
}

export function DraftView({ text, status, errorMessage }: DraftViewProps) {
	const streaming = status === "streaming";
	const done = status === "done";

	return (
		<div className="card">
			<div className={`draft-status${done ? " done" : ""}`}>
				{streaming && <span className="spinner" aria-hidden="true" />}
				<svg
					className="status-check"
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.25"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<polyline points="20 6 9 17 4 12" />
				</svg>
				<span className="mono-micro">
					{streaming
						? "Llama 3.3 70B · NaviGator · on-device"
						: done
							? "NaviGator · on-device"
							: status === "error"
								? "Error"
								: "NaviGator · on-device"}
				</span>
			</div>

			<div className="draft-body" aria-live="polite">
				{text ||
					(!streaming && status === "idle" && (
						<span className="draft-empty">
							Click "Draft reply" to generate a draft in your voice.
						</span>
					))}
				{streaming && <span className="caret" aria-hidden="true" />}
			</div>

			{errorMessage && (
				<p style={{ fontSize: 12, color: "var(--amber)", marginTop: 8 }}>
					{errorMessage}
				</p>
			)}
		</div>
	);
}
