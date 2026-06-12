import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVoiceStore,
  isVoiceTrained,
  loadVoiceCard,
  loadVoiceProfile,
  persistVoiceToMailbox,
  resetVoiceStore,
  voiceClusterNames,
} from "../src/store/voiceSession";
import {
  ProfileV1,
  type Profile,
  type RelationshipCardT,
  RelationshipsV1,
} from "../src/store/schemas";
import { hashAddress } from "../src/intel/relationships";

const PROFILE: Profile = {
  version: 1,
  updated_at: "2026-06-11T00:00:00Z",
  summary: "Warm and concise.",
  bannedPhrases: [],
  userSignoffs: [{ text: "Best,\nG", count: 4, lastUsed: "2026-05-01T00:00:00Z" }],
  userFullName: "Goshtasb Shahriari",
  style_clusters: [],
  formality_prior: null,
  exemplars: [],
  watermarks: {},
};

describe("voiceSession", () => {
  beforeEach(() => resetVoiceStore());

  it("isVoiceTrained is false before any training", async () => {
    expect(await isVoiceTrained()).toBe(false);
  });

  it("loadVoiceProfile is null before training", async () => {
    expect(await loadVoiceProfile("x@ufl.edu")).toBeNull();
  });

  it("after a profile is written, isVoiceTrained is true and loadVoiceProfile maps it", async () => {
    await getVoiceStore().write("profile.json", ProfileV1, PROFILE);
    expect(await isVoiceTrained()).toBe(true);
    const dp = await loadVoiceProfile("smith@ufl.edu");
    expect(dp).not.toBeNull();
    expect(dp!.summary).toBe("Warm and concise.");
    expect(dp!.userFullName).toBe("Goshtasb Shahriari");
    expect(dp!.exemplarPools).toBeDefined();
  });

  it("voiceClusterNames returns the trained cluster names (empty when none)", async () => {
    expect(await voiceClusterNames()).toEqual([]);
    await getVoiceStore().write("profile.json", ProfileV1, PROFILE);
    expect(await voiceClusterNames()).toEqual([]);
  });

  it("resetVoiceStore clears the session", async () => {
    await getVoiceStore().write("profile.json", ProfileV1, PROFILE);
    resetVoiceStore();
    expect(await isVoiceTrained()).toBe(false);
  });
});

describe("voiceSession mailbox persistence (survives Outlook restart)", () => {
  function stubRoaming() {
    const blob = new Map<string, unknown>();
    vi.stubGlobal("Office", {
      context: {
        roamingSettings: {
          get: (k: string) => blob.get(k),
          set: (k: string, v: unknown) => blob.set(k, v),
          remove: (k: string) => blob.delete(k),
          saveAsync: (cb: (r: { status: string }) => void) =>
            cb({ status: "succeeded" }),
        },
      },
      AsyncResultStatus: { Succeeded: "succeeded" },
    });
    return blob;
  }

  beforeEach(() => resetVoiceStore());
  afterEach(() => vi.unstubAllGlobals());

  it("persists multiple styles + per-person cards across a restart", async () => {
    stubRoaming();
    const email = "smith@ufl.edu";
    const hash = await hashAddress(email);
    const cluster = {
      id: 0,
      name: "Formal–faculty",
      centroid: [0.5, 0.5],
      size: 5,
      params: { formality: 0.7 },
      evidence: {
        topTiers: ["faculty"],
        avgWords: 22,
        contractionRate: 0.1,
        sampleOpenings: ["Dear Professor,"],
      },
    };
    const card: RelationshipCardT = {
      address: email,
      displayName: "Dr. Smith",
      tier: "faculty",
      greetings: [{ text: "Dear Dr. Smith,", count: 4, lastUsed: "2026-05-01T00:00:00Z" }],
      closings: [{ text: "Best,", count: 4, lastUsed: "2026-05-01T00:00:00Z" }],
      threadGreetingHabit: { start: "greet", mid: "none" },
      registerHist: { formal: 5 },
      clusterHist: { "0": 5 },
      lengthPrefTokens: 80,
      exemplarTierWeights: {},
      projects: [],
      lastInteraction: "2026-05-01T00:00:00Z",
      sampleCount: 5,
    };
    await getVoiceStore().write("profile.json", ProfileV1, {
      ...PROFILE,
      style_clusters: [cluster],
    });
    await getVoiceStore().write("relationships.json", RelationshipsV1, {
      version: 1,
      entries: { [hash]: card },
    });
    await persistVoiceToMailbox();

    resetVoiceStore(); // simulate Outlook restart — session memory gone

    expect(await isVoiceTrained()).toBe(true);
    expect(await voiceClusterNames()).toEqual(["Formal–faculty"]); // styles survived
    const back = await loadVoiceCard(email);
    expect(back?.tier).toBe("faculty"); // per-person card survived
    expect(back?.greetings[0]?.text).toBe("Dear Dr. Smith,");
    const dp = await loadVoiceProfile(email);
    expect(dp?.summary).toBe("Warm and concise.");
  });

  it("is null/false when nothing was ever persisted", async () => {
    stubRoaming();
    expect(await isVoiceTrained()).toBe(false);
    expect(await loadVoiceProfile("x@ufl.edu")).toBeNull();
  });
});
