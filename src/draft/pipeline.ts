/**
 * Draft pipeline — the LangGraph flow from backend/src/glean/draft/graph.py
 * ported as explicit async stages (no graph lib), SESSION A2 §3.7:
 *
 *   fetchBody -> htmlToText -> sanitize+wrap -> loadProfile+loadCard ->
 *   predictRegister -> ladder exemplars -> MACRO context (pair-thread <=5,
 *   status card, RRF top-6 chunks) -> buildPrompts -> chatStream (deltas) ->
 *   verify (deterministic checks + LLM verifier, fail-CLOSED) -> wrap.ts ->
 *   feedback-queue entry -> DraftResult.
 *
 * A2 simplifications vs the legacy graph (documented for §8): no intent
 * classifier node, no redraft retry loop, no polisher — verifier failure
 * surfaces reasons + the UI's explicit "Use anyway" (Session 06 §3.4 rule).
 * Drafts are NEVER auto-sent.
 */

import type { GraphMessage } from "../graph/mail";
import { htmlToText } from "../graph/mail";
import { bm25Rank } from "../intel/bm25";
import { styleFeatureVector } from "../intel/features";
import {
	type ExemplarPools,
	selectExemplars,
	type TieredExemplar,
} from "../intel/ladder";
import {
	formalityLevel,
	levelNote,
	MIN_N,
	type RegisterLevel,
} from "../intel/register";
import { rrfFuse } from "../intel/rrf";
import { cosine } from "../intel/vectors";
import type { OpenMessage } from "../office/context";
import { sanitizeForLlm } from "../security/sanitize";
import { findBannedPhrases, findGreetingOrSignoffInBody } from "./checks";
import {
	buildDrafterMessages,
	buildVerifierMessages,
	type ChatMessages,
	splitClaims,
} from "./prompts";
import {
	coldStartGreeting,
	coldStartSignoff,
	type LexiconEntry,
	type RelationshipCard,
	selectClosing,
	selectGreeting,
	type ThreadPosition,
	wrapDraft,
} from "./wrap";

export interface DraftRequest {
	message: OpenMessage;
	tweak?: "shorter" | "warmer" | "detail";
	styleOverride?: string;
}

export interface DraftResult {
	text: string;
	register: string;
	styleUsed: string;
	exemplarTiers: string[];
	verifier: { passed: boolean; reasons: string[] };
}

export interface DraftProfile {
	summary: string;
	bannedPhrases: string[];
	userSignoffs: LexiconEntry[];
	userFullName: string;
	exemplarPools?: ExemplarPools;
	/** Voice-synthesis line from cluster params (design doc §4), if computed. */
	voiceSynthesis?: string;
	/** Fitted cluster name shown as styleUsed (A3 — e.g. "Formal–faculty"). */
	styleName?: string;
}

export interface ProjectContext {
	statusCard: string;
	chunks: { id: string; text: string; embedding?: number[] }[];
	queryEmbedding?: number[];
}

/** Feedback-queue entry — design doc §3.3 (consumed by A3's catch-up). */
export interface FeedbackEntry {
	conversationId: string;
	recipientHash: string;
	draftFeatures: number[];
	greetingUsed: string;
	closingUsed: string;
	tierUsed: string;
	bodyTokens: number;
	ts: string;
}

export interface StreamOpts {
	model?: string;
	system: string;
	user: string;
	abort?: AbortSignal;
}

export interface DraftDeps {
	fetchMessage(internetMessageId: string): Promise<GraphMessage | null>;
	fetchThreadHistory?(
		conversationId: string,
		max: number,
	): Promise<{ from: string; body: string }[]>;
	loadProfile(): Promise<DraftProfile | null>;
	loadCard(recipientEmail: string): Promise<RelationshipCard | null>;
	loadProjectContext?(message: OpenMessage): Promise<ProjectContext | null>;
	chatStream(opts: StreamOpts): AsyncGenerator<string>;
	chat(opts: StreamOpts): Promise<string>;
	appendFeedback(entry: FeedbackEntry): Promise<void>;
	/**
	 * Called by acceptDraft() when the user explicitly accepts a draft —
	 * A3 wires this to foldAcceptedDraft (project corpus + status refresh).
	 * Never invoked by runDraft itself: drafts are not auto-folded.
	 */
	onAccepted?(result: DraftResult): Promise<void>;
	abort?: AbortSignal;
	now?: () => Date;
}

/** Explicit acceptance hook (SESSION A3 §3.5) — UI calls this, not runDraft. */
export async function acceptDraft(
	deps: DraftDeps,
	result: DraftResult,
): Promise<void> {
	await deps.onAccepted?.(result);
}

const SANITIZE_MAX = 8000; // per-block cap inside prompts (callers of the legacy used 600-16k)
const THREAD_HISTORY_MAX = 5;

/** Register from the card's histogram; thin/absent signal fails FORMAL. */
export function predictRegister(card: RelationshipCard | null): RegisterLevel {
	const hist = card?.registerHist;
	if (!hist) return "formal";
	const weights: Record<string, number> = {
		formal: 1.0,
		neutral: 0.5,
		casual: 0.0,
	};
	let total = 0;
	let weighted = 0;
	for (const [level, count] of Object.entries(hist)) {
		if (!(level in weights)) continue; // unknown legacy keys must not dilute fail-formal
		total += count;
		weighted += weights[level] * count;
	}
	if (total === 0) return "formal";
	return formalityLevel(weighted / total, total, MIN_N);
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function approxTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** RRF top-6 over BM25 + dense cosine (design doc §1-MACRO); null-safe until A3. */
function retrieveChunks(query: string, ctx: ProjectContext | null): string[] {
	if (!ctx || ctx.chunks.length === 0) return [];
	const bm25 = bm25Rank(query, ctx.chunks).map((r) => r.id);
	const rankings: string[][] = [bm25];
	if (ctx.queryEmbedding && ctx.chunks.every((c) => c.embedding)) {
		const dense = ctx.chunks
			.map((c) => ({
				id: c.id,
				sim: cosine(ctx.queryEmbedding as number[], c.embedding as number[]),
			}))
			.sort((a, b) => b.sim - a.sim)
			.map((r) => r.id);
		rankings.push(dense);
	}
	const fused = rrfFuse(rankings);
	const byId = new Map(ctx.chunks.map((c) => [c.id, c.text]));
	return fused
		.map((f) => byId.get(f.id))
		.filter((t): t is string => typeof t === "string")
		.map((t) => sanitizeForLlm(t, SANITIZE_MAX));
}

interface VerifierVerdict {
	passed: boolean;
	reasons: string[];
}

function parseVerifierResponse(raw: string): VerifierVerdict {
	let parsed: {
		passed?: boolean;
		issues?: {
			type?: string;
			severity?: string;
			span?: string;
			explanation?: string;
		}[];
		commitments?: { text?: string; supported?: boolean }[];
	};
	try {
		// Defensive: models sometimes wrap JSON in fences.
		const stripped = raw
			.trim()
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/```$/, "");
		parsed = JSON.parse(stripped);
	} catch {
		// Fail CLOSED: an unparseable verdict is never treated as a pass.
		return {
			passed: false,
			reasons: ["verifier verdict unparseable — fail closed"],
		};
	}
	const reasons: string[] = [];
	for (const issue of parsed.issues ?? []) {
		reasons.push(
			`${issue.type ?? "issue"} (${issue.severity ?? "?"}): ${issue.explanation ?? issue.span ?? ""}`.trim(),
		);
	}
	for (const c of parsed.commitments ?? []) {
		if (c.supported === false)
			reasons.push(`unsupported commitment: ${c.text ?? ""}`);
	}
	const highIssue = (parsed.issues ?? []).some((i) => i.severity === "high");
	const badCommitment = (parsed.commitments ?? []).some(
		(c) => c.supported === false,
	);
	const passed = parsed.passed === true && !highIssue && !badCommitment;
	return { passed, reasons };
}

export async function runDraft(
	req: DraftRequest,
	deps: DraftDeps,
	onDelta?: (delta: string) => void,
): Promise<DraftResult> {
	const now = deps.now ?? (() => new Date());

	// --- fetch + htmlToText + sanitize (order is load-bearing: entities decode
	// in htmlToText BEFORE sanitize sees the text) ---------------------------
	const graphMessage = await deps.fetchMessage(req.message.internetMessageId);
	const rawBody = graphMessage?.body?.content ?? "";
	const bodyText =
		graphMessage?.body?.contentType?.toLowerCase() === "text"
			? rawBody
			: htmlToText(rawBody);
	const safeBody = sanitizeForLlm(bodyText, SANITIZE_MAX);
	const safeSubject = sanitizeForLlm(req.message.subject, 500);
	const safeFrom = sanitizeForLlm(req.message.senderEmail, 200);

	// --- profile + relationship card (null card -> cold start) --------------
	const [profile, card] = await Promise.all([
		deps.loadProfile(),
		deps.loadCard(req.message.senderEmail),
	]);

	// --- register + exemplar ladder -----------------------------------------
	const register = predictRegister(card);
	const exemplars: TieredExemplar[] = selectExemplars(
		profile?.exemplarPools ?? { t1: [], t2: [], t3: [] },
	);

	// --- MACRO context: pair-thread history (<=5) + status card + RRF chunks
	const history =
		(await deps.fetchThreadHistory?.(
			req.message.conversationId,
			THREAD_HISTORY_MAX,
		)) ?? [];
	const threadContext = history
		.map((h) => sanitizeForLlm(`${h.from}: ${h.body}`, SANITIZE_MAX))
		.join("\n---\n");
	const projectCtx = (await deps.loadProjectContext?.(req.message)) ?? null;
	const statusCard = projectCtx
		? sanitizeForLlm(projectCtx.statusCard, SANITIZE_MAX)
		: "";
	const retrievedChunks = retrieveChunks(
		`${safeSubject} ${safeBody}`,
		projectCtx,
	);

	// --- prompts -------------------------------------------------------------
	// Profile/card fields are user-owned OneDrive data, but A3 will fold
	// EXTERNAL content into them (sender display names, mined summaries), and
	// senderName comes straight from the From header — sanitize them all.
	const recipientName = sanitizeForLlm(
		card?.displayName ?? req.message.senderName ?? "",
		200,
	);
	const safeVoiceSummary = sanitizeForLlm(profile?.summary ?? "", 4000);
	const drafterMessages: ChatMessages = buildDrafterMessages({
		voiceSummary: safeVoiceSummary,
		bannedPhrases: (profile?.bannedPhrases ?? []).map((p) =>
			sanitizeForLlm(p, 200),
		),
		registerNote: levelNote(register),
		voiceSynthesis: profile?.voiceSynthesis
			? sanitizeForLlm(profile.voiceSynthesis, 500)
			: undefined,
		recipientName,
		exemplars,
		threadContext,
		statusCard,
		retrievedChunks,
		fromEmail: safeFrom,
		subject: safeSubject,
		body: safeBody,
		styleOverride: req.styleOverride,
		tweak: req.tweak,
	});

	// --- stream the BODY -----------------------------------------------------
	let raw = "";
	for await (const delta of deps.chatStream({
		...drafterMessages,
		abort: deps.abort,
	})) {
		raw += delta;
		onDelta?.(delta);
	}
	const { body } = splitClaims(raw);

	// --- verify: deterministic checks first (belt), LLM verifier (suspenders)
	const reasons: string[] = [];
	reasons.push(...findGreetingOrSignoffInBody(body));
	for (const phrase of findBannedPhrases(body, profile?.bannedPhrases ?? [])) {
		reasons.push(`banned phrase: "${phrase}"`);
	}
	const sourceThread = [threadContext, safeBody]
		.filter(Boolean)
		.join("\n---\n");
	// The draft is our own LLM's output but may echo structural tokens or
	// injected instructions from the email — scrub before the verifier prompt.
	const verifierMessages = buildVerifierMessages({
		draftBody: sanitizeForLlm(body, SANITIZE_MAX),
		sourceThread,
		voiceSummary: safeVoiceSummary,
		expectedRegister: register,
		recipientName,
	});
	const nDeterministicIssues = reasons.length;
	const llmVerdict = parseVerifierResponse(
		await deps.chat({ ...verifierMessages, abort: deps.abort }),
	);
	reasons.push(...llmVerdict.reasons);
	// Pass = LLM verdict passed (no high issues, all commitments supported —
	// medium issues surface as reasons without blocking, legacy semantics) AND
	// no deterministic check fired.
	const passed = llmVerdict.passed && nDeterministicIssues === 0;

	// --- deterministic wrap (design doc §1-MICRO) ----------------------------
	const threadPosition: ThreadPosition = history.length > 0 ? "mid" : "start";
	const greeting = card
		? selectGreeting(card, threadPosition, now())
		: threadPosition === "start"
			? coldStartGreeting(req.message.senderName)
			: "";
	const closing = card
		? selectClosing(card, now()) ||
			coldStartSignoff(profile?.userSignoffs ?? [], profile?.userFullName ?? "")
		: coldStartSignoff(
				profile?.userSignoffs ?? [],
				profile?.userFullName ?? "",
			);
	const text = wrapDraft(body, greeting, closing);

	// --- feedback-queue entry (design doc §3.3; consumed in A3) ---------------
	await deps.appendFeedback({
		conversationId: req.message.conversationId,
		recipientHash: await sha256Hex(req.message.senderEmail.toLowerCase()),
		draftFeatures: styleFeatureVector(body),
		greetingUsed: greeting,
		closingUsed: closing,
		tierUsed: exemplars[0]?.tier ?? "T4",
		bodyTokens: approxTokens(body),
		ts: now().toISOString(),
	});

	return {
		text,
		register,
		styleUsed: req.styleOverride ?? profile?.styleName ?? "voice",
		exemplarTiers: exemplars.map((e) => e.tier),
		verifier: { passed, reasons },
	};
}
