/**
 * key.ts — the ONLY NaviGator key accessor (design doc §5, custody §2.2).
 * sessionStorage-backed; validated live via GET /v1/models; the key must
 * never appear in thrown errors, logs, or any persisted file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_KEY_STORAGE_KEY, clearNavKey, getNavKey, setNavKey } from "../src/llm/key";

const SECRET = "sk-navigator-super-secret-12345";

function mockModels(status: number, ids: string[] = []): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status }),
    ),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setNavKey", () => {
  it("validates via GET /v1/models and stores the key in sessionStorage only", async () => {
    mockModels(200, ["llama-3.3-70b-instruct", "nomic-embed-text"]);
    const count = await setNavKey(SECRET);
    expect(count).toBe(2);
    expect(sessionStorage.getItem(NAV_KEY_STORAGE_KEY)).toBe(SECRET);
    expect(localStorage.length).toBe(0); // never persisted beyond the session
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain("/models");
    expect(String(call[0])).not.toContain(SECRET); // never in URLs
  });

  it("rejects an invalid key without storing it and without leaking it", async () => {
    mockModels(401);
    let err: Error | null = null;
    try {
      await setNavKey(SECRET);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message).not.toContain(SECRET);
    expect(String(err)).not.toContain(SECRET);
    expect(getNavKey()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("network failure also never leaks the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    let err: Error | null = null;
    try {
      await setNavKey(SECRET);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? "").not.toContain(SECRET);
    expect(getNavKey()).toBeNull();
  });
});

describe("getNavKey / clearNavKey", () => {
  it("returns null when absent", () => {
    expect(getNavKey()).toBeNull();
  });

  it("round-trips after a successful set and clears on clearNavKey", async () => {
    mockModels(200, ["m"]);
    await setNavKey(SECRET);
    expect(getNavKey()).toBe(SECRET);
    clearNavKey();
    expect(getNavKey()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
