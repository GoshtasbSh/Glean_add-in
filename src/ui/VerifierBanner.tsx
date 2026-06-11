interface VerifierBannerProps {
	passed: boolean;
	reasons: string[];
	onUseAnyway: () => void;
	onFix: () => void;
}

export function VerifierBanner({
	passed,
	reasons,
	onUseAnyway,
	onFix,
}: VerifierBannerProps) {
	return (
		<div
			className={`verifier-banner ${passed ? "pass" : "fail"}`}
			role="region"
			aria-label="Verification result"
		>
			<div className="verifier-head-row">
				{passed ? (
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
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
						<path d="m9 12 2 2 4-4" />
					</svg>
				) : (
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
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				)}
				<span className="verifier-title">
					{passed
						? "Verified · all checks passed"
						: `${reasons.length} check${reasons.length !== 1 ? "s" : ""} need${reasons.length === 1 ? "s" : ""} review`}
				</span>
			</div>

			{!passed && reasons.length > 0 && (
				<div className="verifier-reasons">
					{reasons.map((r) => (
						<div key={r} className="verifier-reason-row">
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
							<span>{r}</span>
						</div>
					))}
				</div>
			)}

			{!passed && (
				<div className="verifier-actions">
					<button type="button" className="btn-sm-primary" onClick={onFix}>
						Fix it
					</button>
					<button type="button" className="btn-sm-ghost" onClick={onUseAnyway}>
						Use anyway
					</button>
				</div>
			)}
		</div>
	);
}
