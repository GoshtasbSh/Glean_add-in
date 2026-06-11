/**
 * SESSION A3 §3.1 — tightened store schemas. RelationshipsV1 + FeedbackQueueV1
 * mirror design doc §3.1/§3.3 EXACTLY; ProjectV1 carries the §3.2 status card;
 * SettingsV1 is design doc §6. No z.unknown() survives A1 (repo-wide rule).
 */
import { describe, expect, it } from "vitest";
import {
	FeedbackQueueV1,
	MeetingV1,
	ProfileV1,
	ProjectV1,
	parseOrThrow,
	RelationshipsV1,
	SettingsV1,
} from "../src/store/schemas";

const lexEntry = {
	text: "Dear Dr Von Meding,",
	count: 31,
	lastUsed: "2026-06-01T00:00:00Z",
};

const card = {
	address: "j.vonmeding@ufl.edu",
	displayName: "Jason Von Meding",
	tier: "faculty",
	greetings: [lexEntry],
	closings: [
		{
			text: "Best regards,\nGoshtasb",
			count: 28,
			lastUsed: "2026-06-01T00:00:00Z",
		},
	],
	threadGreetingHabit: { start: "greet", mid: "none" },
	registerHist: { formal: 30, neutral: 2, informal: 0 },
	clusterHist: { "0": 29, "2": 3 },
	lengthPrefTokens: 110,
	exemplarTierWeights: { T1: 1.0, T2: 1.0 },
	projects: ["cedar-key"],
	lastInteraction: "2026-06-01T00:00:00Z",
	sampleCount: 32,
};

const profile = {
	version: 1 as const,
	updated_at: "2026-06-11T00:00:00Z",
	summary: "Writes formally to faculty.",
	bannedPhrases: ["I hope this email finds you well"],
	userSignoffs: [
		{
			text: "Best regards,\nGoshtasb",
			count: 12,
			lastUsed: "2026-06-01T00:00:00Z",
		},
	],
	userFullName: "Goshtasb Shahriari",
	style_clusters: [
		{
			id: 0,
			name: "Formal–faculty",
			centroid: [0.8, 4.1, 18.2],
			size: 31,
			params: { avg_sentence_len: 18.2, contraction_rate: 0.01 },
			evidence: {
				topTiers: ["faculty"],
				avgWords: 120,
				contractionRate: 0.01,
				sampleOpenings: ["Thank you for the detailed feedback"],
			},
		},
	],
	formality_prior: { abc123hash: 0.82 },
	exemplars: [
		{
			recipientHash: "abc123hash",
			register: "formal",
			styleVector: [0.8, 4.1],
			text: "Thank you for the detailed feedback on the draft.",
			sourceMsgId: "AAMkAG=",
			sentAt: "2026-05-30T12:00:00Z",
			cluster: 0,
		},
	],
	watermarks: { onboarding: "2026-06-01T00:00:00Z" },
};

describe("ProfileV1 (tightened — no unknowns)", () => {
	it("accepts a full valid profile", () => {
		expect(() => ProfileV1.parse(profile)).not.toThrow();
	});

	it("rejects an untyped style cluster (A1 z.unknown removed)", () => {
		const bad = { ...profile, style_clusters: [{ anything: true }] };
		expect(() => ProfileV1.parse(bad)).toThrow();
	});

	it("rejects a wrong version literal", () => {
		expect(() => ProfileV1.parse({ ...profile, version: 2 })).toThrow();
	});

	it("rejects an exemplar missing recipientHash", () => {
		const rest = { ...profile.exemplars[0], recipientHash: undefined };
		expect(() => ProfileV1.parse({ ...profile, exemplars: [rest] })).toThrow();
	});

	it("allows formality_prior null (cold profile)", () => {
		expect(() =>
			ProfileV1.parse({ ...profile, formality_prior: null }),
		).not.toThrow();
	});
});

describe("RelationshipsV1 (design doc §3.1 exact shape)", () => {
	it("accepts a valid card keyed by recipientHash", () => {
		const rel = { version: 1, entries: { abc123hash: card } };
		expect(() => RelationshipsV1.parse(rel)).not.toThrow();
	});

	it("rejects a tier outside the heuristic set", () => {
		const rel = { version: 1, entries: { h: { ...card, tier: "boss" } } };
		expect(() => RelationshipsV1.parse(rel)).toThrow();
	});

	it("rejects a greeting entry without count", () => {
		const rel = {
			version: 1,
			entries: {
				h: { ...card, greetings: [{ text: "Hi,", lastUsed: "2026-01-01" }] },
			},
		};
		expect(() => RelationshipsV1.parse(rel)).toThrow();
	});
});

describe("FeedbackQueueV1 (design doc §3.3 — unchanged from A2)", () => {
	it("accepts the entry the A2 pipeline writes", () => {
		const queue = {
			version: 1,
			entries: [
				{
					conversationId: "c1",
					recipientHash: "h",
					draftFeatures: [0.5, 3.2],
					greetingUsed: "Dear Jason,",
					closingUsed: "Best,\nG",
					tierUsed: "T4",
					bodyTokens: 80,
					ts: "2026-06-11T00:00:00Z",
				},
			],
		};
		expect(() => FeedbackQueueV1.parse(queue)).not.toThrow();
	});
});

describe("ProjectV1 (status card §3.2 + chunks + graph)", () => {
	const project = {
		version: 1,
		name: "Cedar Key",
		slug: "cedar-key",
		match_rules: {
			participants: ["s.mitchell@ufl.edu"],
			keywords: ["cedar key", "posterior"],
		},
		status: {
			stage: "active",
			open_threads: ["posterior plots question from Sarah"],
			recent_decisions: ["new sampling run, not new priors"],
			next_milestones: [
				{ what: "summary for stakeholder call", when: "2026-06-12" },
			],
			updated_at: "2026-06-11T00:00:00Z",
		},
		graph: {
			nodes: [{ id: "sarah mitchell", type: "person" }],
			edges: [{ a: "sarah mitchell", b: "posterior", weight: 2 }],
		},
		chunks: [
			{
				text: "We agreed to rerun sampling with the same priors.",
				embedding: [0.1, 0.2],
				source: {
					type: "email",
					id: "AAMkAG=:0",
					date: "2026-06-10T00:00:00Z",
				},
			},
		],
		watermark: "2026-06-10T00:00:00Z",
	};

	it("accepts a valid project file", () => {
		expect(() => ProjectV1.parse(project)).not.toThrow();
	});

	it("rejects an invalid status stage", () => {
		const bad = { ...project, status: { ...project.status, stage: "done" } };
		expect(() => ProjectV1.parse(bad)).toThrow();
	});

	it("rejects a chunk without source ref (idempotency key)", () => {
		const bad = { ...project, chunks: [{ text: "x", embedding: [0.1] }] };
		expect(() => ProjectV1.parse(bad)).toThrow();
	});
});

describe("SettingsV1 (design doc §6)", () => {
	const settings = {
		version: 1,
		labels: [{ name: "Cedar Key", color: "#22c55e", enabled: true }],
		rules: [
			{
				type: "sender",
				pattern: "j.vonmeding@ufl.edu",
				label: "To Respond",
				priority: 1,
				enabled: true,
			},
			{
				type: "domain",
				pattern: "ufl.edu",
				label: "FYI",
				priority: 2,
				enabled: true,
			},
			{
				type: "keyword",
				pattern: "cedar key",
				label: "Cedar Key",
				priority: 3,
				enabled: false,
			},
		],
		category_map: { "To Respond": "Glean/To respond" },
		project_rules: [
			{
				name: "Cedar Key",
				slug: "cedar-key",
				participants: ["s.mitchell@ufl.edu"],
				keywords: ["cedar key"],
			},
		],
	};

	it("accepts valid settings", () => {
		expect(() => SettingsV1.parse(settings)).not.toThrow();
	});

	it("rejects a rule type outside sender|domain|keyword", () => {
		const bad = {
			...settings,
			rules: [
				{
					type: "regex",
					pattern: ".*",
					label: "X",
					priority: 1,
					enabled: true,
				},
			],
		};
		expect(() => SettingsV1.parse(bad)).toThrow();
	});

	it("rejects an untyped project rule (A1 z.unknown removed)", () => {
		const bad = { ...settings, project_rules: [{ whatever: 1 }] };
		expect(() => SettingsV1.parse(bad)).toThrow();
	});
});

describe("MeetingV1 skeleton (A5 fills)", () => {
	it("accepts the minimal skeleton", () => {
		expect(() =>
			MeetingV1.parse({ version: 1, eventId: "evt1" }),
		).not.toThrow();
	});
});

describe("parseOrThrow (migration guard)", () => {
	it("returns parsed data on success", () => {
		const q = parseOrThrow(
			FeedbackQueueV1,
			{ version: 1, entries: [] },
			"feedback-queue.json",
		);
		expect(q.entries).toEqual([]);
	});

	it("throws with the file name and no content echo on failure", () => {
		expect(() =>
			parseOrThrow(
				ProfileV1,
				{ version: 99, secret: "BODYTEXT" },
				"profile.json",
			),
		).toThrow(/profile\.json/);
		try {
			parseOrThrow(
				ProfileV1,
				{ version: 99, secret: "BODYTEXT" },
				"profile.json",
			);
		} catch (e) {
			// FERPA: validation errors must never echo file content into logs.
			expect((e as Error).message).not.toContain("BODYTEXT");
		}
	});
});
