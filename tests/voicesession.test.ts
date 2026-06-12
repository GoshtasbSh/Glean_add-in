import { describe, it, expect, beforeEach } from "vitest";
import {
  getVoiceStore,
  resetVoiceStore,
  isVoiceTrained,
  loadVoiceProfile,
  voiceClusterNames,
} from "../src/store/voiceSession";
import { ProfileV1, type Profile } from "../src/store/schemas";

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
