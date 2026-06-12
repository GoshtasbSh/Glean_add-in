import { describe, it, expect } from "vitest";
import { toDraftProfile } from "../src/draft/profileAdapter";
import type { Profile } from "../src/store/schemas";

const PROFILE: Profile = {
  version: 1,
  updated_at: "2026-06-11T00:00:00Z",
  summary: "Warm, concise, prefers bullet points.",
  bannedPhrases: ["circle back"],
  userSignoffs: [{ text: "Best,\nGoshtasb", count: 7 }],
  userFullName: "Goshtasb Shahriari",
  style_clusters: [],
  formality_prior: null,
  exemplars: [],
  watermarks: {},
};

describe("toDraftProfile", () => {
  it("passes voice fields through from the trained ProfileV1", () => {
    const dp = toDraftProfile(PROFILE, "hash-abc", null);
    expect(dp.summary).toBe("Warm, concise, prefers bullet points.");
    expect(dp.bannedPhrases).toEqual(["circle back"]);
    expect(dp.userSignoffs).toEqual([{ text: "Best,\nGoshtasb", count: 7 }]);
    expect(dp.userFullName).toBe("Goshtasb Shahriari");
  });

  it("always produces exemplar pools (t1/t2/t3), even with no exemplars", () => {
    const dp = toDraftProfile(PROFILE, "hash-abc", null);
    expect(dp.exemplarPools).toBeDefined();
    expect(dp.exemplarPools).toHaveProperty("t1");
    expect(dp.exemplarPools).toHaveProperty("t2");
    expect(dp.exemplarPools).toHaveProperty("t3");
  });

  it("leaves voiceSynthesis undefined when there are no clusters", () => {
    const dp = toDraftProfile(PROFILE, "hash-abc", null);
    expect(dp.voiceSynthesis).toBeUndefined();
  });
});
