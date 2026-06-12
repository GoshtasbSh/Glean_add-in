/**
 * key.ts — the ONLY NaviGator key accessor (design doc §5, custody §2.2).
 * sessionStorage-backed; validated live via GET /v1/models; the key must
 * never appear in thrown errors, logs, or any persisted file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearNavKey,
	getNavKey,
	NAV_KEY_STORAGE_KEY,
	setNavKey,
} from "../src/llm/key";

const SECRET = "sk-navigator-super-secret-12345";

function mockModels(status: number, ids: string[] = []): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
					status,
				}),
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
		const { count, modelIds } = await setNavKey(SECRET);
		expect(count).toBe(2);
		expect(modelIds).toEqual(["llama-3.3-70b-instruct", "nomic-embed-text"]);
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
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
		);
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

describe("roaming (mailbox) persistence — survives Outlook restarts", () => {
	function stubRoaming() {
		const store = new Map<string, unknown>();
		const saveAsync = vi.fn((cb: (r: { status: string }) => void) =>
			cb({ status: "succeeded" }),
		);
		vi.stubGlobal("Office", {
			context: {
				roamingSettings: {
					get: (k: string) => store.get(k),
					set: (k: string, v: unknown) => store.set(k, v),
					remove: (k: string) => store.delete(k),
					saveAsync,
				},
			},
			AsyncResultStatus: { Succeeded: "succeeded" },
		});
		return { store, saveAsync };
	}

	it("setNavKey persists the key to the user's own mailbox and saves it", async () => {
		const { store, saveAsync } = stubRoaming();
		mockModels(200, ["m"]);
		await setNavKey(SECRET);
		expect(store.get(NAV_KEY_STORAGE_KEY)).toBe(SECRET);
		expect(saveAsync).toHaveBeenCalled();
	});

	it("getNavKey rehydrates from the mailbox when the session is empty (fresh start)", () => {
		const { store } = stubRoaming();
		store.set(NAV_KEY_STORAGE_KEY, SECRET);
		sessionStorage.clear();
		expect(getNavKey()).toBe(SECRET);
	});

	it("getNavKey prefers the in-session copy over the mailbox copy", () => {
		const { store } = stubRoaming();
		store.set(NAV_KEY_STORAGE_KEY, "stale-old-key");
		sessionStorage.setItem(NAV_KEY_STORAGE_KEY, SECRET);
		expect(getNavKey()).toBe(SECRET);
	});

	it("clearNavKey forgets the key in BOTH the session and the mailbox", async () => {
		const { store } = stubRoaming();
		mockModels(200, ["m"]);
		await setNavKey(SECRET);
		expect(store.get(NAV_KEY_STORAGE_KEY)).toBe(SECRET);
		clearNavKey();
		expect(getNavKey()).toBeNull();
		expect(store.has(NAV_KEY_STORAGE_KEY)).toBe(false);
	});
});
