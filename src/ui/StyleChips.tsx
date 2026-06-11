/**
 * StyleChips — voice style selector.
 * The default chip (from relationship card) is marked with a star and a "learned from N emails"
 * caption. Selecting a non-default chip shows a "Remember for <name>?" button.
 *
 * Graph-gate: the "Remember for <name>" persist-to-card action needs OneDrive (Graph).
 * When graphAvailable=false the remember button is present but calls onRemember with a no-op
 * at the call site — the gate wrapper in DraftPanel disables it visually.
 */

export interface StyleChip {
	id: string;
	label: string;
}

interface StyleChipsProps {
	chips: StyleChip[];
	defaultChipId: string;
	selectedChipId: string;
	recipientName: string;
	learnedCount: number;
	/** Whether persisting the override to OneDrive is available (needs Graph). */
	graphAvailable?: boolean;
	onSelect: (chipId: string) => void;
	onRemember: (chipId: string) => void;
}

export function StyleChips({
	chips,
	defaultChipId,
	selectedChipId,
	recipientName,
	learnedCount,
	graphAvailable = false,
	onSelect,
	onRemember,
}: StyleChipsProps) {
	const isDefault = selectedChipId === defaultChipId;
	const selectedLabel =
		chips.find((c) => c.id === selectedChipId)?.label ?? selectedChipId;

	return (
		<div>
			<div className="voice-head">
				<span className="micro-label">Writing as</span>
			</div>
			<div className="chip-row" role="group" aria-label="Voice style">
				{chips.map((chip) => {
					const active = chip.id === selectedChipId;
					const isDefaultChip = chip.id === defaultChipId;
					return (
						<button
							key={chip.id}
							type="button"
							className={`voice-chip${isDefaultChip ? " is-default" : ""}`}
							aria-pressed={active}
							onClick={() => onSelect(chip.id)}
						>
							{isDefaultChip && active && (
								<svg
									className="star"
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="currentColor"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
								</svg>
							)}
							{chip.label}
						</button>
					);
				})}
			</div>

			<div className="voice-caption">
				{isDefault ? (
					<>
						Default for {recipientName} · learned from {learnedCount} emails
					</>
				) : graphAvailable ? (
					<button
						type="button"
						className="remember-btn"
						onClick={() => onRemember(selectedChipId)}
						aria-label={`Remember for ${recipientName}`}
					>
						Remember for {recipientName}?
					</button>
				) : (
					<>
						<button
							type="button"
							className="remember-btn"
							disabled
							aria-label={`Remember for ${recipientName} (requires Microsoft 365)`}
							style={{ opacity: 0.45 }}
						>
							Remember for {recipientName}?
						</button>{" "}
						<span style={{ fontSize: 10, color: "var(--ink-3)" }}>
							(needs Microsoft 365)
						</span>
					</>
				)}
				{!isDefault && graphAvailable && <> · using {selectedLabel}</>}
			</div>
		</div>
	);
}
