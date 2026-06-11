// A1+A2 Graph-mode demo — proves the foundation + intelligence chains against
// Microsoft Graph (needs MSAL sign-in). Reachable at ?graph for testing the
// Graph path once UFIT enables it (Phase 3). The default pane is FreeMode.
import { type CSSProperties, useRef, useState } from "react";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import {
	acceptDraft,
	type DraftDeps,
	type DraftResult,
	type FeedbackEntry,
	predictRegister,
	runDraft,
} from "./draft/pipeline";
import { assignCategories, ensureCategory } from "./graph/categories";
import { graph } from "./graph/client";
import { getMessageByInternetId, htmlToText } from "./graph/mail";
import {
	type CatchupResult,
	defaultSettings,
	runCatchup,
} from "./intel/catchup";
import { foldAcceptedDraft } from "./intel/folddraft";
import { type FitProgress, fitVoice, ONBOARDING_CAP } from "./intel/onboarding";
import { buildExemplarPools, voiceSynthesisLine } from "./intel/pools";
import { hashAddress } from "./intel/relationships";
import { listInboxSince, listSentSince } from "./intel/scan";
import { cleanBody } from "./intel/strip";
import { clearNavKey, getNavKey, setNavKey } from "./llm/key";
import { DRAFT_MODEL, pickDraftModel } from "./llm/models";
import { chat, chatStream, embed, NeedsKeyError } from "./llm/navigator";
import { getOpenMessage, type OpenMessage } from "./office/context";
import { ConflictError, store } from "./store/onedrive";
import {
	type FeedbackQueue,
	FeedbackQueueV1,
	type Profile,
	ProfileV1,
	ProjectV1,
	RelationshipsV1,
	type Settings,
	SettingsV1,
} from "./store/schemas";

const box: CSSProperties = {
	border: "1px solid #ccc",
	borderRadius: 6,
	padding: 12,
	marginBottom: 12,
};

function Demo() {
	const { account, signIn, signOut } = useAuth();
	const [msg] = useState<OpenMessage | null>(() => getOpenMessage());
	const [me, setMe] = useState<string>("");
	const [bodyPreview, setBodyPreview] = useState<string>("");
	const [storeResult, setStoreResult] = useState<string>("");
	const [categoryResult, setCategoryResult] = useState<string>("");
	const [error, setError] = useState<string>("");

	async function handleSignIn() {
		setError("");
		try {
			await signIn();
			const profile = await graph<{ displayName: string }>("GET", "/me");
			setMe(profile.displayName);
		} catch (e) {
			setError(e instanceof Error ? e.message : "sign-in failed");
		}
	}

	async function handleReadBody() {
		setError("");
		try {
			if (!msg?.internetMessageId) throw new Error("No open message");
			const full = await getMessageByInternetId(msg.internetMessageId);
			if (!full?.body) throw new Error("Message not found via Graph");
			setBodyPreview(htmlToText(full.body.content).slice(0, 200));
		} catch (e) {
			setError(e instanceof Error ? e.message : "read failed");
		}
	}

	async function handleStoreSelfTest() {
		setError("");
		setStoreResult("running…");
		try {
			const skeleton: Profile = {
				version: 1,
				updated_at: new Date().toISOString(),
				summary: "",
				bannedPhrases: [],
				userSignoffs: [],
				userFullName: "",
				style_clusters: [],
				formality_prior: null,
				exemplars: [],
				watermarks: {},
			};
			const { etag } = await store.write("profile.json", ProfileV1, skeleton);
			const back = await store.read("profile.json", ProfileV1);
			if (!back) throw new Error("read-after-write returned null");
			let conflictSeen = false;
			try {
				await store.write(
					"profile.json",
					ProfileV1,
					skeleton,
					'"stale-etag-on-purpose"',
				);
			} catch (e) {
				conflictSeen = e instanceof ConflictError;
			}
			setStoreResult(
				`round-trip ok (etag ${etag.slice(0, 12)}…) · ConflictError on stale etag: ${conflictSeen ? "✓" : "✗"}`,
			);
		} catch (e) {
			setStoreResult("");
			setError(e instanceof Error ? e.message : "store self-test failed");
		}
	}

	async function handleCategoryTest() {
		setError("");
		try {
			const cat = await ensureCategory("Glean/To respond", "preset0");
			setCategoryResult(`ensured "${cat.displayName}" (${cat.color})`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "category test failed");
		}
	}

	return (
		<div style={{ padding: 16, fontFamily: "sans-serif", fontSize: 14 }}>
			<h2>Local Glean — Graph self-test (?graph)</h2>

			<div style={box}>
				<strong>Open message (Office.js)</strong>
				{msg ? (
					<ul>
						<li>Subject: {msg.subject}</li>
						<li>
							From: {msg.senderName} &lt;{msg.senderEmail}&gt;
						</li>
					</ul>
				) : (
					<p>No message selected (or running outside Outlook).</p>
				)}
			</div>

			<div style={box}>
				<strong>Sign-in (MSAL → Entra)</strong>
				<p>
					{account ? (
						<>
							{me || account.username}{" "}
							<button type="button" onClick={signOut}>
								Sign out
							</button>
						</>
					) : (
						<button type="button" onClick={handleSignIn}>
							Sign in with UF account
						</button>
					)}
				</p>
			</div>

			<div style={box}>
				<strong>Graph mail read</strong>
				<p>
					<button
						type="button"
						onClick={handleReadBody}
						disabled={!account || !msg}
					>
						Read open message body via Graph
					</button>
				</p>
				{bodyPreview && <p style={{ color: "#333" }}>{bodyPreview}…</p>}
			</div>

			<div style={box}>
				<strong>OneDrive approot store</strong>
				<p>
					<button
						type="button"
						onClick={handleStoreSelfTest}
						disabled={!account}
					>
						Run store self-test (write → read → conflict)
					</button>
				</p>
				{storeResult && <p>{storeResult}</p>}
			</div>

			<div style={box}>
				<strong>Outlook categories</strong>
				<p>
					<button
						type="button"
						onClick={handleCategoryTest}
						disabled={!account}
					>
						Ensure "Glean/To respond" category
					</button>
				</p>
				{categoryResult && <p>{categoryResult}</p>}
			</div>

			<A3Orchestration account={!!account} msg={msg} />

			<A2DraftDemo account={!!account} msg={msg} />

			{error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
		</div>
	);
}

// --- A3 demo: onboarding + settings + catch-up (temporary; A4 replaces) -----
function A3Orchestration({
	account,
	msg,
}: {
	account: boolean;
	msg: OpenMessage | null;
}) {
	const [fitProgress, setFitProgress] = useState<FitProgress | null>(null);
	const [fitResult, setFitResult] = useState<string>("");
	const [fitBusy, setFitBusy] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const [settingsJson, setSettingsJson] = useState<string>("");
	const [settingsStatus, setSettingsStatus] = useState("");

	const [catchupBusy, setCatchupBusy] = useState(false);
	const [catchupResult, setCatchupResult] = useState<CatchupResult | null>(
		null,
	);
	const [cleanedPreview, setCleanedPreview] = useState("");
	const [error, setError] = useState("");

	function llmDeps() {
		return {
			embed: (texts: string[], opts?: { abort?: AbortSignal }) =>
				embed(texts, opts),
			chat: (opts: { system: string; user: string; abort?: AbortSignal }) =>
				chat({ ...opts, model: DRAFT_MODEL, temperature: 0 }),
		};
	}

	async function handleFitVoice() {
		const ok = window.confirm(
			`"Fit my voice" scans up to ${ONBOARDING_CAP} sent emails and embeds each one ` +
				`(~${Math.ceil(ONBOARDING_CAP / 32)} embedding requests + 2 chat requests against ` +
				"your personal NaviGator quota). It can take 10-20 minutes on a large mailbox and " +
				"is safe to interrupt (it resumes where it left off). Start?",
		);
		if (!ok) return;
		setError("");
		setFitResult("");
		setFitBusy(true);
		const controller = new AbortController();
		abortRef.current = controller;
		const startedAt = performance.now();
		try {
			const profile = await fitVoice(
				{
					listSent: (since, opts) => listSentSince(since, opts),
					...llmDeps(),
					store,
					userFullName:
						Office?.context?.mailbox?.userProfile?.displayName ?? "",
				},
				(p) => setFitProgress(p),
				controller.signal,
			);
			const minutes = ((performance.now() - startedAt) / 60000).toFixed(1);
			setFitResult(
				`done in ${minutes} min — K=${profile.style_clusters.length} ` +
					`[${profile.style_clusters.map((c) => `${c.name} (${c.size})`).join(", ")}], ` +
					`${profile.exemplars.length} exemplars, ` +
					`${Object.keys(profile.formality_prior ?? {}).length} prior entries`,
			);
		} catch (e) {
			if ((e as Error).name === "AbortError") {
				setFitResult(
					"aborted — progress saved in profile.partial.json; run again to resume",
				);
			} else if (e instanceof NeedsKeyError) {
				setError("Set your NaviGator key first (A2 box below).");
			} else {
				setError(e instanceof Error ? e.message : "onboarding failed");
			}
		} finally {
			setFitBusy(false);
			setFitProgress(null);
			abortRef.current = null;
		}
	}

	async function handleLoadSettings() {
		setError("");
		try {
			const existing = await store.read("settings.json", SettingsV1);
			const base = existing?.data ?? {
				...defaultSettings(),
				// the user's real project, prefilled (edit before saving)
				project_rules: [
					{
						name: "Cedar Key",
						slug: "cedar-key",
						participants: [],
						keywords: ["cedar key"],
					},
				],
			};
			setSettingsJson(JSON.stringify(base, null, 2));
		} catch (e) {
			setError(e instanceof Error ? e.message : "settings load failed");
		}
	}

	async function handleSaveSettings() {
		setError("");
		setSettingsStatus("saving…");
		try {
			const parsed: Settings = SettingsV1.parse(JSON.parse(settingsJson));
			const existing = await store.read("settings.json", SettingsV1);
			await store.write("settings.json", SettingsV1, parsed, existing?.etag);
			// Ensure every mapped Outlook category exists (visible colors in Outlook).
			const presets = [
				"preset0",
				"preset3",
				"preset5",
				"preset6",
				"preset9",
				"preset11",
			];
			let i = 0;
			for (const name of new Set(Object.values(parsed.category_map))) {
				await ensureCategory(name, presets[i % presets.length]);
				i += 1;
			}
			setSettingsStatus(
				`saved — ${parsed.rules.length} rules, ${parsed.project_rules.length} project(s), categories ensured`,
			);
		} catch (e) {
			setSettingsStatus("");
			setError(e instanceof Error ? e.message : "settings save failed");
		}
	}

	async function handleCatchup() {
		setError("");
		setCatchupBusy(true);
		setCatchupResult(null);
		try {
			const result = await runCatchup({
				listInbox: (since, opts) => listInboxSince(since, opts),
				listSent: (since, opts) => listSentSince(since, opts),
				...llmDeps(),
				assignCategories: (id, names) => assignCategories(id, names),
				store,
			});
			setCatchupResult(result);
		} catch (e) {
			if (e instanceof NeedsKeyError)
				setError("Set your NaviGator key first (A2 box below).");
			else setError(e instanceof Error ? e.message : "catch-up failed");
		} finally {
			setCatchupBusy(false);
		}
	}

	// Dev-only debug (§6): show what the strip pass produces for the open message.
	async function handlePreviewCleaned() {
		setError("");
		try {
			if (!msg?.internetMessageId) throw new Error("No open message");
			const full = await getMessageByInternetId(msg.internetMessageId);
			const raw = full?.body?.content ?? "";
			const text =
				full?.body?.contentType?.toLowerCase() === "text"
					? raw
					: htmlToText(raw);
			setCleanedPreview(cleanBody(text).slice(0, 1200));
		} catch (e) {
			setError(e instanceof Error ? e.message : "preview failed");
		}
	}

	return (
		<div style={box}>
			<strong>A3 — onboarding · settings · catch-up</strong>

			<p>
				<button
					type="button"
					onClick={handleFitVoice}
					disabled={!account || fitBusy}
				>
					{fitBusy ? "Fitting…" : "Fit my voice (scan sent mail)"}
				</button>{" "}
				{fitBusy && (
					<button type="button" onClick={() => abortRef.current?.abort()}>
						Abort
					</button>
				)}
			</p>
			{fitProgress && (
				<p>
					stage: {fitProgress.stage} — {fitProgress.done}/{fitProgress.total}
					<progress
						max={Math.max(1, fitProgress.total)}
						value={fitProgress.done}
						style={{ marginLeft: 8, width: 160 }}
					/>
				</p>
			)}
			{fitResult && <p style={{ color: "#0a5" }}>{fitResult}</p>}

			<p>
				<button type="button" onClick={handleLoadSettings} disabled={!account}>
					Load settings (or defaults)
				</button>{" "}
				<button
					type="button"
					onClick={handleSaveSettings}
					disabled={!account || !settingsJson}
				>
					Save settings + ensure categories
				</button>
			</p>
			{settingsJson && (
				<textarea
					value={settingsJson}
					onChange={(e) => setSettingsJson(e.target.value)}
					rows={12}
					style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
				/>
			)}
			{settingsStatus && <p>{settingsStatus}</p>}

			<p>
				<button
					type="button"
					onClick={handleCatchup}
					disabled={!account || catchupBusy}
				>
					{catchupBusy ? "Catching up…" : "Run catch-up"}
				</button>{" "}
				{import.meta.env.DEV && (
					// Dev builds only (security review): renders FERPA mail content.
					<button
						type="button"
						onClick={handlePreviewCleaned}
						disabled={!account || !msg}
					>
						Show cleaned text (debug)
					</button>
				)}
			</p>
			{catchupResult && (
				<p style={{ color: "#0a5" }}>
					processed {catchupResult.processed} · labeled {catchupResult.labeled}{" "}
					· projects touched:{" "}
					{catchupResult.projectsTouched.join(", ") || "none"} · sent-diff
					matched: {catchupResult.sentDiffMatched}
				</p>
			)}
			{cleanedPreview && (
				<pre
					style={{
						whiteSpace: "pre-wrap",
						background: "#f6f6f6",
						padding: 8,
						fontSize: 11,
					}}
				>
					{cleanedPreview}
				</pre>
			)}
			{error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
		</div>
	);
}

// --- A2 demo: NaviGator key + real draft pipeline (temporary; A4 replaces) --
function A2DraftDemo({
	account,
	msg,
}: {
	account: boolean;
	msg: OpenMessage | null;
}) {
	const [keyInput, setKeyInput] = useState("");
	const [keyStatus, setKeyStatus] = useState(
		getNavKey() ? "key set (this session)" : "",
	);
	const [modelId, setModelId] = useState<string>(DRAFT_MODEL);
	const [streaming, setStreaming] = useState("");
	const [result, setResult] = useState<DraftResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const startedAt = useRef(0);
	const [elapsedMs, setElapsedMs] = useState<number | null>(null);
	const lastDeps = useRef<DraftDeps | null>(null);
	const [acceptStatus, setAcceptStatus] = useState("");

	async function handleSetKey() {
		setError("");
		try {
			// setNavKey is the ONLY place an Authorization header is built from the
			// key; it returns the live model ids so we never re-fetch with it here.
			const { count, modelIds } = await setNavKey(keyInput);
			setKeyInput(""); // drop the plaintext from React state immediately
			setModelId(pickDraftModel(modelIds) ?? DRAFT_MODEL);
			setKeyStatus(`validated — ${count} models visible`);
		} catch (e) {
			setKeyStatus("");
			setError(e instanceof Error ? e.message : "key validation failed");
		}
	}

	function buildDeps(): DraftDeps {
		// Per-draft closure: profile + card + pools are recomputed for THIS sender.
		const loadCard = async () => {
			if (!msg) return null;
			const rels = await store
				.read("relationships.json", RelationshipsV1)
				.catch(() => null);
			const hash = await hashAddress(msg.senderEmail);
			return rels?.data.entries[hash] ?? null;
		};
		return {
			fetchMessage: (id) => getMessageByInternetId(id),
			loadProfile: async () => {
				// REAL fitted profile (A3): pools per recipient, voice synthesis from
				// the recipient's dominant cluster (falls back to the largest cluster).
				const stored = await store
					.read("profile.json", ProfileV1)
					.catch(() => null);
				const fallbackName =
					Office?.context?.mailbox?.userProfile?.displayName ?? "";
				if (!stored || !msg) {
					return {
						summary: "",
						bannedPhrases: [],
						userSignoffs: [],
						userFullName: fallbackName,
						exemplarPools: { t1: [], t2: [], t3: [] },
					};
				}
				const profile = stored.data;
				const card = await loadCard();
				const register = predictRegister(card);
				const hash = await hashAddress(msg.senderEmail);
				let dominant = profile.style_clusters[0];
				if (card?.clusterHist) {
					const top = Object.entries(card.clusterHist).sort(
						(a, b) => b[1] - a[1],
					)[0];
					dominant =
						profile.style_clusters.find((c) => c.id === Number(top?.[0])) ??
						dominant;
				}
				return {
					summary: profile.summary,
					bannedPhrases: profile.bannedPhrases,
					userSignoffs: profile.userSignoffs,
					userFullName: profile.userFullName || fallbackName,
					exemplarPools: buildExemplarPools(
						profile.exemplars,
						hash,
						register,
						card?.clusterHist,
					),
					voiceSynthesis: dominant ? voiceSynthesisLine(dominant) : undefined,
					styleName: dominant?.name,
				};
			},
			loadCard,
			loadProjectContext: async (message) => {
				// Project context for MACRO grounding: sender/subject match only
				// (the kNN arm needs an embed call; rules cover the demo).
				const files = await store.list("projects").catch(() => []);
				for (const f of files) {
					if (!f.name.endsWith(".json")) continue;
					const read = await store
						.read(`projects/${f.name}`, ProjectV1)
						.catch(() => null);
					if (!read) continue;
					const p = read.data;
					const sender = message.senderEmail.toLowerCase();
					const subject = message.subject.toLowerCase();
					const hit =
						p.match_rules.participants.some(
							(a) => a.toLowerCase() === sender,
						) ||
						p.match_rules.keywords.some((k) =>
							subject.includes(k.toLowerCase()),
						);
					if (hit) {
						return {
							statusCard: JSON.stringify(p.status),
							chunks: p.chunks.map((c, i) => ({
								id: c.source.id || String(i),
								text: c.text,
								embedding: c.embedding,
							})),
						};
					}
				}
				return null;
			},
			chatStream: (opts) => chatStream({ ...opts, model: modelId }),
			chat: (opts) => chat({ ...opts, model: modelId, temperature: 0 }),
			appendFeedback: async (entry: FeedbackEntry) => {
				const existing = await store
					.read("feedback-queue.json", FeedbackQueueV1)
					.catch(() => null);
				const queue: FeedbackQueue = existing?.data ?? {
					version: 1,
					entries: [],
				};
				queue.entries.push(entry);
				await store.write(
					"feedback-queue.json",
					FeedbackQueueV1,
					queue,
					existing?.etag,
				);
			},
			onAccepted: async (result) => {
				if (!msg) return;
				await foldAcceptedDraft(msg, result.text, {
					store,
					embed: (texts) => embed(texts),
					chat: (opts) => chat({ ...opts, model: modelId, temperature: 0 }),
				});
			},
		};
	}

	async function handleDraft() {
		setError("");
		setStreaming("");
		setResult(null);
		setElapsedMs(null);
		setBusy(true);
		startedAt.current = performance.now();
		try {
			if (!msg) throw new Error("No open message");
			const deps = buildDeps();
			lastDeps.current = deps;
			setAcceptStatus("");
			const out = await runDraft({ message: msg }, deps, (delta) =>
				setStreaming((s) => s + delta),
			);
			setElapsedMs(Math.round(performance.now() - startedAt.current));
			setResult(out);
		} catch (e) {
			if (e instanceof NeedsKeyError) setError("Set your NaviGator key first.");
			else setError(e instanceof Error ? e.message : "draft failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div style={box}>
			<strong>A2 — NaviGator key + draft pipeline</strong>
			<p>
				<input
					type="password"
					placeholder="NaviGator API key (sessionStorage only)"
					value={keyInput}
					onChange={(e) => setKeyInput(e.target.value)}
					style={{ width: 260 }}
				/>{" "}
				<button type="button" onClick={handleSetKey} disabled={!keyInput}>
					Validate &amp; set key
				</button>{" "}
				<button
					type="button"
					onClick={() => {
						clearNavKey();
						setKeyStatus("");
					}}
				>
					Clear key
				</button>
			</p>
			{keyStatus && (
				<p>
					{keyStatus} · draft model: {modelId}
				</p>
			)}
			<p>
				<button
					type="button"
					onClick={handleDraft}
					disabled={!account || !msg || busy}
				>
					{busy ? "Drafting…" : "Draft reply for open message"}
				</button>
				{elapsedMs !== null && <> · {elapsedMs} ms</>}
			</p>
			{streaming && (
				<>
					<em>streamed body:</em>
					<pre
						style={{
							whiteSpace: "pre-wrap",
							background: "#f6f6f6",
							padding: 8,
						}}
					>
						{streaming}
					</pre>
				</>
			)}
			{result && (
				<>
					<em>
						wrapped result (style {result.styleUsed} · register{" "}
						{result.register} · tiers {result.exemplarTiers.join(",")})
						{" — verifier "}
						{result.verifier.passed ? "PASSED" : "FAILED"}
					</em>
					<pre
						style={{
							whiteSpace: "pre-wrap",
							background: "#eef6ee",
							padding: 8,
						}}
					>
						{result.text}
					</pre>
					<p>
						<button
							type="button"
							title="Folds this thread into its project corpus (A3 §3.5) — sending stays manual"
							onClick={async () => {
								try {
									if (lastDeps.current)
										await acceptDraft(lastDeps.current, result);
									setAcceptStatus(
										"accepted — folded into the matched project (if any)",
									);
								} catch (e) {
									setAcceptStatus(
										e instanceof Error ? e.message : "accept failed",
									);
								}
							}}
						>
							Accept draft (fold into project)
						</button>{" "}
						{acceptStatus}
					</p>
					{!result.verifier.passed && (
						<>
							<pre
								style={{
									whiteSpace: "pre-wrap",
									background: "#fdecea",
									padding: 8,
								}}
							>
								{result.verifier.reasons.join("\n")}
							</pre>
							<button
								type="button"
								onClick={() => undefined}
								title="Explicit override — draft is never auto-sent"
							>
								Use anyway
							</button>
						</>
					)}
				</>
			)}
			{error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
		</div>
	);
}

export default function GraphDemo() {
	return (
		<AuthProvider>
			<Demo />
		</AuthProvider>
	);
}
