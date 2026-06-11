/**
 * InsertButton — sticky CTA that calls Office.js displayReplyForm with DOMPurify-sanitized HTML.
 * Inserted content is the WRAPPED draft (greeting/sign-off from wrap.ts, never edited by UI).
 * CUSTODY: draft is sanitized before insertion; add-in never sends — the human clicks Send.
 */
import { useEffect, useRef, useState } from "react";
import { insertReply } from "../office/reply";

interface InsertButtonProps {
	draftText: string;
	disabled: boolean;
}

export function InsertButton({ draftText, disabled }: InsertButtonProps) {
	const [success, setSuccess] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

	function handleInsert() {
		try {
			insertReply(draftText);
		} catch {
			return;
		}
		setSuccess(true);
		timerRef.current = setTimeout(() => setSuccess(false), 2000);
	}

	return (
		<div className="cta-wrap">
			<button
				type="button"
				className={`cta${success ? " success" : ""}`}
				onClick={handleInsert}
				disabled={disabled || !draftText}
				aria-label="Insert into reply"
			>
				{success ? (
					"Inserted ✓"
				) : (
					<>
						<span>Insert into reply</span>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<line x1="5" y1="12" x2="19" y2="12" />
							<polyline points="12 5 19 12 12 19" />
						</svg>
					</>
				)}
			</button>
		</div>
	);
}
