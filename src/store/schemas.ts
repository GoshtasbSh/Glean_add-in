import { z } from "zod";

/**
 * OneDrive approot file schemas — single source of truth (OVERVIEW §3).
 * Tightened in A3 (§3.1): RelationshipsV1 + FeedbackQueueV1 are EXACTLY the
 * design doc §3.1/§3.3 shapes; ProjectV1 carries the §3.2 status card;
 * SettingsV1 is design doc §6. No z.unknown() anywhere (A1 skeletons retired).
 */

// --- shared ----------------------------------------------------------------

/** Greeting/closing lexicon entry — counts + recency drive wrap.ts selection. */
export const LexiconEntryV1 = z.object({
	text: z.string(),
	count: z.number().int().nonnegative(),
	lastUsed: z.string(), // ISO timestamp
});
export type LexiconEntryT = z.infer<typeof LexiconEntryV1>;

// --- profile.json ------------------------------------------------------------

export const ClusterEvidenceV1 = z.object({
	topTiers: z.array(z.string()),
	avgWords: z.number(),
	contractionRate: z.number(),
	sampleOpenings: z.array(z.string()),
});
export type ClusterEvidence = z.infer<typeof ClusterEvidenceV1>;

export const StyleClusterV1 = z.object({
	id: z.number().int().nonnegative(),
	name: z.string(),
	/** ORIGINAL (un-standardized) feature space, parity with style_clusters.py. */
	centroid: z.array(z.number()),
	size: z.number().int().positive(),
	/** Named micro-marker means — feeds the §4 voice-synthesis prompt line. */
	params: z.record(z.string(), z.number()),
	/** Per-cluster naming evidence (design doc §1-MESO). */
	evidence: ClusterEvidenceV1,
});
export type StyleCluster = z.infer<typeof StyleClusterV1>;

export const ExemplarV1 = z.object({
	/** SHA-256 of the lowercased recipient address — never the address itself. */
	recipientHash: z.string(),
	register: z.enum(["formal", "neutral", "casual"]),
	styleVector: z.array(z.number()),
	text: z.string(),
	sourceMsgId: z.string(),
	sentAt: z.string(),
	/** Style cluster the exemplar belongs to — required to build the T2 pool. */
	cluster: z.number().int().nonnegative(),
});
export type Exemplar = z.infer<typeof ExemplarV1>;

/**
 * Mirror of legacy formality_per_recipient (extractor.py:225-239):
 * mean formality per correspondent (>=5 msgs), keyed by recipientHash here
 * because profile.json stores hashes only (addresses live in relationships.json).
 */
export const FormalityPriorV1 = z.record(z.string(), z.number());
export type FormalityPrior = z.infer<typeof FormalityPriorV1>;

export const ProfileV1 = z.object({
	version: z.literal(1),
	updated_at: z.string(),
	/** LLM voice summary (legacy profile_summary); "" when the call failed. */
	summary: z.string(),
	bannedPhrases: z.array(z.string()),
	/** The user's own learned sign-offs — cold-start signoff source (wrap.ts). */
	userSignoffs: z.array(LexiconEntryV1),
	userFullName: z.string(),
	style_clusters: z.array(StyleClusterV1),
	formality_prior: FormalityPriorV1.nullable(),
	exemplars: z.array(ExemplarV1),
	watermarks: z.record(z.string(), z.string()),
});
export type Profile = z.infer<typeof ProfileV1>;

/**
 * profile.partial.json — onboarding resumability (§3.3). Lives in the user's
 * OneDrive (the one allowed store — custody rule forbids IndexedDB/localStorage),
 * deleted after the final profile write. bodyClean is the user's OWN sent mail
 * and is needed on resume for exemplar selection + lexicon re-accumulation.
 */
export const PartialItemV1 = z.object({
	id: z.string(),
	sentAt: z.string(),
	to: z.array(z.string()),
	toNames: z.array(z.string()),
	subject: z.string(),
	bodyClean: z.string(),
	features: z.array(z.number()),
	embedding: z.array(z.number()),
});
export type PartialItem = z.infer<typeof PartialItemV1>;

export const PartialProfileV1 = z.object({
	version: z.literal(1),
	startedAt: z.string(),
	/** Last processed sentDateTime — resume re-lists since here (asc scan). */
	watermark: z.string(),
	items: z.array(PartialItemV1),
});
export type PartialProfile = z.infer<typeof PartialProfileV1>;

// --- relationships.json (design doc §3.1 — exact shape) ----------------------

export const TierV1 = z.enum(["faculty", "peer", "student", "external"]);
export type Tier = z.infer<typeof TierV1>;

export const RelationshipCardV1 = z.object({
	// Address + displayName intentionally stored: this file lives in the USER'S
	// OWN OneDrive — same custody class as their mailbox (design doc §3.1).
	address: z.string(),
	displayName: z.string(),
	tier: TierV1,
	greetings: z.array(LexiconEntryV1),
	closings: z.array(LexiconEntryV1),
	threadGreetingHabit: z.object({
		start: z.enum(["greet", "none"]),
		mid: z.enum(["greet", "none"]),
	}),
	registerHist: z.record(z.string(), z.number()),
	clusterHist: z.record(z.string(), z.number()),
	/** EMA from sent-diff learning (α=0.3, design doc §3.3). */
	lengthPrefTokens: z.number(),
	/** Downweighted ×0.8 on heavy rewrites, floor 0.4 (design doc §3.3). */
	exemplarTierWeights: z.record(z.string(), z.number()),
	projects: z.array(z.string()),
	lastInteraction: z.string(),
	sampleCount: z.number().int().nonnegative(),
});
export type RelationshipCardT = z.infer<typeof RelationshipCardV1>;

export const RelationshipsV1 = z.object({
	version: z.literal(1),
	/** Keyed by recipientHash (SHA-256 of lowercased address). */
	entries: z.record(z.string(), RelationshipCardV1),
});
export type Relationships = z.infer<typeof RelationshipsV1>;

// --- feedback-queue.json (design doc §3.3 — unchanged from A2) ---------------

export const FeedbackEntryV1 = z.object({
	conversationId: z.string(),
	recipientHash: z.string(),
	draftFeatures: z.array(z.number()),
	greetingUsed: z.string(),
	closingUsed: z.string(),
	tierUsed: z.string(),
	bodyTokens: z.number(),
	ts: z.string(),
});
export type FeedbackEntry = z.infer<typeof FeedbackEntryV1>;

export const FeedbackQueueV1 = z.object({
	version: z.literal(1),
	entries: z.array(FeedbackEntryV1),
});
export type FeedbackQueue = z.infer<typeof FeedbackQueueV1>;

// --- projects/<slug>.json -----------------------------------------------------

/** Status card (design doc §3.2) — LLM-revised at every fold-in, JSON-only. */
// String/array bounds: the card is LLM output that re-enters future prompts —
// an unbounded field would let an injected payload grow and persist (security
// review). Limits are generous for real cards.
export const StatusCardV1 = z.object({
	stage: z.enum(["planning", "active", "review", "wrapping"]),
	open_threads: z.array(z.string().max(500)).max(20),
	recent_decisions: z.array(z.string().max(500)).max(20),
	next_milestones: z
		.array(z.object({ what: z.string().max(500), when: z.string().max(100) }))
		.max(20),
	updated_at: z.string(),
});
export type StatusCard = z.infer<typeof StatusCardV1>;

export const ProjectChunkV1 = z.object({
	text: z.string(),
	embedding: z.array(z.number()),
	/** `${source.id}:${offset}` is the idempotency key for fold-in. */
	source: z.object({ type: z.string(), id: z.string(), date: z.string() }),
});
export type ProjectChunk = z.infer<typeof ProjectChunkV1>;

export const ProjectGraphV1 = z.object({
	nodes: z.array(
		z.object({ id: z.string(), type: z.enum(["person", "topic"]) }),
	),
	edges: z.array(
		z.object({ a: z.string(), b: z.string(), weight: z.number() }),
	),
});
export type ProjectGraph = z.infer<typeof ProjectGraphV1>;

export const ProjectV1 = z.object({
	version: z.literal(1),
	name: z.string(),
	slug: z.string(),
	match_rules: z.object({
		participants: z.array(z.string()),
		keywords: z.array(z.string()),
	}),
	status: StatusCardV1,
	graph: ProjectGraphV1,
	chunks: z.array(ProjectChunkV1),
	watermark: z.string(),
});
export type Project = z.infer<typeof ProjectV1>;

// --- settings.json (design doc §6) -------------------------------------------

export const LabelSettingV1 = z.object({
	name: z.string(),
	color: z.string(),
	enabled: z.boolean(),
});
export type LabelSetting = z.infer<typeof LabelSettingV1>;

export const RuleV1 = z.object({
	type: z.enum(["sender", "domain", "keyword"]),
	pattern: z.string(),
	label: z.string(),
	priority: z.number().int(),
	enabled: z.boolean(),
});
export type Rule = z.infer<typeof RuleV1>;

export const ProjectRuleV1 = z.object({
	name: z.string(),
	slug: z.string(),
	participants: z.array(z.string()),
	keywords: z.array(z.string()),
});
export type ProjectRule = z.infer<typeof ProjectRuleV1>;

export const SettingsV1 = z.object({
	version: z.literal(1),
	labels: z.array(LabelSettingV1),
	rules: z.array(RuleV1),
	category_map: z.record(z.string(), z.string()),
	project_rules: z.array(ProjectRuleV1),
});
export type Settings = z.infer<typeof SettingsV1>;

// --- meetings/<eventId>.json (skeleton — A5 fills) ----------------------------

export const MeetingV1 = z.object({
	version: z.literal(1),
	eventId: z.string(),
	summary: z.string().optional(),
});
export type Meeting = z.infer<typeof MeetingV1>;

// --- migration guard -----------------------------------------------------------

/**
 * Parse `data` against `schema`, failing with the FILE name and the zod issue
 * paths only — never the offending values (FERPA: store files can carry mail
 * content; validation errors end up in error UI/logs).
 */
export function parseOrThrow<S extends z.ZodType>(
	schema: S,
	data: unknown,
	file: string,
): z.infer<S> {
	const result = schema.safeParse(data);
	if (!result.success) {
		const paths = result.error.issues
			.slice(0, 5)
			.map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`)
			.join("; ");
		throw new Error(`Schema validation failed for ${file} — ${paths}`);
	}
	return result.data;
}
