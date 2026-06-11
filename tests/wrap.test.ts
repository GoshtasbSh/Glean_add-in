/**
 * wrap.ts — deterministic micro-voice assembly (design doc §1-MICRO).
 * The LLM never writes greeting/sign-off; code selects them from the
 * relationship card (frequency x recency, thread-position rule) with
 * cold-start formal defaults.
 */
import { describe, expect, it } from "vitest";
import {
  coldStartGreeting,
  coldStartSignoff,
  selectClosing,
  selectGreeting,
  wrapDraft,
  type RelationshipCard,
} from "../src/draft/wrap";

const NOW = new Date("2026-06-10T12:00:00Z");

const vonMedingCard: RelationshipCard = {
  address: "j.vonmeding@ufl.edu",
  displayName: "Jason Von Meding",
  greetings: [
    { text: "Dear Dr Von Meding,", count: 31, lastUsed: "2026-06-01T00:00:00Z" },
    { text: "Hi Jason,", count: 2, lastUsed: "2025-01-10T00:00:00Z" },
  ],
  closings: [
    { text: "Best regards,\nGoshtasb", count: 28, lastUsed: "2026-06-01T00:00:00Z" },
    { text: "Thanks,\nG", count: 1, lastUsed: "2024-12-01T00:00:00Z" },
  ],
  threadGreetingHabit: { start: "greet", mid: "none" },
};

describe("selectGreeting", () => {
  it('card with "Dear Dr Von Meding," -> that exact greeting, always (DoD case)', () => {
    expect(selectGreeting(vonMedingCard, "start", NOW)).toBe("Dear Dr Von Meding,");
  });

  it("recency outweighs raw count when the frequent form is stale", () => {
    const card: RelationshipCard = {
      ...vonMedingCard,
      greetings: [
        { text: "Dear Prof Smith,", count: 10, lastUsed: "2020-01-01T00:00:00Z" }, // ~6.4y stale
        { text: "Hi Sarah,", count: 4, lastUsed: "2026-06-05T00:00:00Z" },
      ],
    };
    expect(selectGreeting(card, "start", NOW)).toBe("Hi Sarah,");
  });

  it("mid-thread with habit mid=none -> no greeting", () => {
    expect(selectGreeting(vonMedingCard, "mid", NOW)).toBe("");
  });

  it("mid-thread with habit mid=greet keeps the greeting", () => {
    const card = { ...vonMedingCard, threadGreetingHabit: { start: "greet", mid: "greet" } as const };
    expect(selectGreeting(card, "mid", NOW)).toBe("Dear Dr Von Meding,");
  });

  it("default mid-thread habit (no habit recorded) is none", () => {
    const card = { ...vonMedingCard, threadGreetingHabit: undefined };
    expect(selectGreeting(card, "mid", NOW)).toBe("");
  });

  it("card with empty greeting lexicon falls back to cold-start formal", () => {
    const card = { ...vonMedingCard, greetings: [] };
    expect(selectGreeting(card, "start", NOW)).toBe("Dear Jason Von Meding,");
  });
});

describe("selectClosing", () => {
  it("picks the frequency x recency winner", () => {
    expect(selectClosing(vonMedingCard, NOW)).toBe("Best regards,\nGoshtasb");
  });
  it("empty lexicon -> empty string (caller falls back to cold start)", () => {
    expect(selectClosing({ ...vonMedingCard, closings: [] }, NOW)).toBe("");
  });
});

describe("cold start (no card) — design doc §1-MICRO", () => {
  it("greeting: Dear <Title LastName as in From-header>,", () => {
    expect(coldStartGreeting("Dr. Sarah Mitchell")).toBe("Dear Dr. Sarah Mitchell,");
    expect(coldStartGreeting("Jason Von Meding")).toBe("Dear Jason Von Meding,");
  });
  it("greeting falls back to Dear Sir/Madam for empty/role senders", () => {
    expect(coldStartGreeting("")).toBe("Dear Sir/Madam,");
  });
  it("signoff: most formal learned sign-off, else full name", () => {
    expect(
      coldStartSignoff(
        [
          { text: "Thanks,\nG", count: 50, lastUsed: "2026-06-01T00:00:00Z" },
          { text: "Sincerely,\nGoshtasb Shahriari", count: 3, lastUsed: "2026-05-01T00:00:00Z" },
        ],
        "Goshtasb Shahriari",
      ),
    ).toBe("Sincerely,\nGoshtasb Shahriari");
    expect(coldStartSignoff([], "Goshtasb Shahriari")).toBe("Best regards,\nGoshtasb Shahriari");
  });
});

describe("wrapDraft", () => {
  it("assembles [greeting]\\n\\n[body]\\n\\n[sign-off]", () => {
    expect(wrapDraft("Body text.", "Dear Dr Von Meding,", "Best regards,\nGoshtasb")).toBe(
      "Dear Dr Von Meding,\n\nBody text.\n\nBest regards,\nGoshtasb",
    );
  });
  it("omits empty greeting cleanly (mid-thread)", () => {
    expect(wrapDraft("Body.", "", "Thanks,\nG")).toBe("Body.\n\nThanks,\nG");
  });
  it("trims stray whitespace from the body", () => {
    expect(wrapDraft("  Body.  \n", "Hi,", "Thanks,")).toBe("Hi,\n\nBody.\n\nThanks,");
  });
});
