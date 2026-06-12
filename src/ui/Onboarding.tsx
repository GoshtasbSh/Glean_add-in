/**
 * Onboarding — first-run flow in FREE mode (no Graph required).
 * Steps: consent screen → NaviGator key → done.
 *
 * Voice training is FREE — the user trains it in Settings by uploading their own .eml files
 * (parseEml → fitVoice, no Graph). Only AUTO-learning from the whole sent-mail history needs
 * Graph (Mail.Read), which is gated. Until trained, Glean drafts in a neutral professional voice.
 */
import { useState } from "react";
import { KeyScreen } from "./KeyScreen";

type Step = "consent" | "key" | "done";

interface OnboardingProps {
	onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
	const [step, setStep] = useState<Step>("consent");

	if (step === "done") {
		return (
			<div className="onboarding">
				<div className="onboarding-logo" aria-hidden="true">
					G
				</div>
				<h2>You're all set</h2>
				<p className="onboarding-sub">
					Glean is connected to NaviGator and ready to draft replies in your
					voice.
				</p>
				<div
					className="progress-steps"
					role="group"
					aria-label="Setup progress"
				>
					<span className="progress-step done" />
					<span className="progress-step done" />
					<span className="progress-step active" />
				</div>
				<button
					type="button"
					className="cta"
					style={{ marginTop: 8, maxWidth: 260 }}
					onClick={onComplete}
				>
					Open Glean →
				</button>
				<div
					className="ms-gate-row"
					role="note"
					style={{
						marginTop: 16,
						justifyContent: "center",
						border: "1px solid var(--hairline)",
						borderRadius: "var(--r-card)",
						padding: "10px 14px",
						background: "var(--surface-2)",
					}}
				>
					<svg
						width="12"
						height="12"
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
					<span style={{ fontSize: 11, color: "var(--ink-3)" }}>
						<strong style={{ color: "var(--ink-2)" }}>Train your voice free</strong>{" "}
						in Settings — upload a few sent emails. (Auto-learning from your whole
						history needs Microsoft 365 · pending UFIT.)
					</span>
				</div>
			</div>
		);
	}

	if (step === "key") {
		return (
			<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
				<div style={{ padding: "16px 16px 0" }}>
					<div
						className="progress-steps"
						aria-label="Setup progress"
						style={{ justifyContent: "flex-start" }}
					>
						<span className="progress-step done" />
						<span className="progress-step active" />
						<span className="progress-step" />
					</div>
				</div>
				<KeyScreen onConnected={() => setStep("done")} />
			</div>
		);
	}

	// Consent screen
	return (
		<div className="onboarding">
			<div className="onboarding-logo" aria-hidden="true">
				G
			</div>
			<h2>Welcome to Glean</h2>
			<p className="onboarding-sub">
				A FERPA-safe email assistant that drafts replies in your voice, using UF
				NaviGator — nothing ever leaves your device.
			</p>

			<div className="progress-steps" role="group" aria-label="Setup progress">
				<span className="progress-step active" />
				<span className="progress-step" />
				<span className="progress-step" />
			</div>

			<div className="consent-box">
				<p
					style={{
						fontSize: 11,
						fontWeight: 600,
						color: "var(--ink-2)",
						marginBottom: 6,
					}}
				>
					What Glean does on your device:
				</p>
				<div className="consent-item">
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
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>
						Reads the <strong>open email only</strong> — no inbox scanning (free
						mode)
					</span>
				</div>
				<div className="consent-item">
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
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>
						Sends the draft body to <strong>UF NaviGator</strong> only
						(api.ai.it.ufl.edu) — no OpenAI, no Google
					</span>
				</div>
				<div className="consent-item">
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
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>
						Stores only your <strong>NaviGator key in this session</strong> —
						cleared on close, never on disk
					</span>
				</div>
				<div className="consent-item">
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
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>
						Prefills Outlook's reply form — <strong>you send</strong>, Glean
						never sends
					</span>
				</div>
			</div>

			<button
				type="button"
				className="cta"
				style={{ maxWidth: 260, marginTop: 8 }}
				onClick={() => setStep("key")}
			>
				Continue →
			</button>
		</div>
	);
}
