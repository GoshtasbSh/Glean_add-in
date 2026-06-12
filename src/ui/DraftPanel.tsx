/**
 * DraftPanel — the Draft tab panel. Wires all Draft-tab components together.
 *
 * FREE features (all wired):
 *   read open email → NaviGator draft → verifier → tweak → insert into reply
 *
 * STUB (pending Graph / A3 real data):
 *   style chips = generic defaults (no relationship card)
 *   context register = null (no relationship card)
 *   "Remember for person" = disabled (needs OneDrive)
 */
import { useEffect, useState } from "react";
import { useDraftStream } from "../hooks/useDraftStream";
import type { OpenMessage } from "../office/context";
import { voiceClusterNames } from "../store/voiceSession";
import { ContextCard } from "./ContextCard";
import { DraftView } from "./DraftView";
import { InsertButton } from "./InsertButton";
import { StyleChips } from "./StyleChips";
import { TweakBar } from "./TweakBar";
import { VerifierBanner } from "./VerifierBanner";

// Default style chips — real cluster names come from profile.json (A3/Graph).
const DEFAULT_CHIPS = [
	{ id: "voice", label: "My voice" },
	{ id: "formal", label: "Formal" },
	{ id: "concise", label: "Concise" },
	{ id: "warm", label: "Warm" },
];

interface DraftPanelProps {
	message: OpenMessage | null;
}

export function DraftPanel({ message }: DraftPanelProps) {
	const [selectedChip, setSelectedChip] = useState("voice");
	const [chips, setChips] = useState(DEFAULT_CHIPS);
	const [learnedCount, setLearnedCount] = useState(0);
	const stream = useDraftStream(message);

	// Reflect the session-trained voice (free .eml upload): show real cluster
	// names as chips. Re-runs when the Draft tab re-mounts (after training).
	useEffect(() => {
		let live = true;
		voiceClusterNames().then((names) => {
			if (!live || names.length === 0) return;
			setChips([{ id: "voice", label: "My voice" }, ...names.map((n) => ({ id: n, label: n }))]);
			setLearnedCount(names.length);
		});
		return () => {
			live = false;
		};
	}, []);

	const streaming = stream.status === "streaming";
	const hasDraft =
		stream.status === "done" ||
		(stream.status === "streaming" && stream.text.length > 0);

	function handleDraft(tweak?: Parameters<typeof stream.run>[0]) {
		const styleOverride = selectedChip !== "voice" ? { styleOverride: selectedChip } : {};
		stream.run(tweak ? { ...styleOverride, ...tweak } : styleOverride);
	}

	function handleFix() {
		// Re-run the draft pipeline without tweak to attempt auto-fix
		handleDraft();
	}

	function handleUseAnyway() {
		// User acknowledges the verifier warning — insert proceeds with the draft as-is.
		// The Insert button remains enabled; no further action needed here.
	}

	if (!message) {
		return (
			<div style={{ padding: "20px 16px" }}>
				<ContextCard
					message={null}
					predictedRegister={null}
					asks={[]}
					projectName={null}
				/>
			</div>
		);
	}

	return (
		<div>
			{/* 1. Context card */}
			<ContextCard
				message={message}
				predictedRegister={null}
				asks={[]}
				projectName={null}
			/>

			{/* 2. Style chips (stub chips in free mode; real clusters need Graph) */}
			<div className="card" style={{ marginTop: 12 }}>
				<StyleChips
					chips={chips}
					defaultChipId="voice"
					selectedChipId={selectedChip}
					recipientName={message.senderName || "this person"}
					learnedCount={learnedCount}
					graphAvailable={false}
					onSelect={setSelectedChip}
					onRemember={() => {
						/* disabled — needs Graph */
					}}
				/>
			</div>

			{/* 3. Draft card with verifier */}
			<div style={{ marginTop: 12 }}>
				{stream.status === "idle" && !stream.text ? (
					<div className="card">
						<button
							type="button"
							className="cta"
							onClick={() => handleDraft()}
							disabled={streaming}
						>
							Draft reply in my voice
						</button>
					</div>
				) : (
					<DraftView
						text={stream.text}
						status={stream.status}
						errorMessage={stream.errorMessage}
					/>
				)}

				{stream.verifier && (
					<VerifierBanner
						passed={stream.verifier.passed}
						reasons={stream.verifier.reasons}
						onUseAnyway={handleUseAnyway}
						onFix={handleFix}
					/>
				)}
			</div>

			{/* 4. Tweak bar */}
			{hasDraft && (
				<TweakBar
					disabled={streaming}
					onTweak={(tweak) => handleDraft({ tweak })}
				/>
			)}

			{/* 5. Insert button (sticky CTA) */}
			<InsertButton
				draftText={stream.text}
				disabled={streaming || !stream.text}
			/>
		</div>
	);
}
