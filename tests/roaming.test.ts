import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftProfile } from "../src/draft/pipeline";
import {
	loadFreeProfile,
	roamingGet,
	roamingSave,
	roamingSet,
	saveFreeProfile,
} from "../src/store/roaming";

function stubRoaming(initial: Record<string, unknown> = {}, saveFails = false) {
	const bag = { ...initial };
	const set = vi.fn((k: string, v: unknown) => {
		bag[k] = v;
	});
	const get = vi.fn((k: string) => bag[k]);
	const remove = vi.fn((k: string) => {
		delete bag[k];
	});
	const saveAsync = vi.fn((cb: (r: { status: string }) => void) =>
		cb({ status: saveFails ? "failed" : "succeeded" }),
	);
	vi.stubGlobal("Office", {
		AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
		context: { roamingSettings: { get, set, remove, saveAsync } },
	});
	return { bag, set, get, saveAsync };
}

const PROFILE: DraftProfile = {
	summary: "Concise, warm, prefers bullet points.",
	bannedPhrases: ["circle back"],
	userSignoffs: [{ text: "Best,", count: 9 }],
	userFullName: "Goshtasb Shahriari Mehr",
};

describe("roaming store", () => {
	beforeEach(() => vi.unstubAllGlobals());

	it("set then get round-trips a value (in memory)", () => {
		stubRoaming();
		roamingSet("k", { a: 1 });
		expect(roamingGet<{ a: number }>("k")).toEqual({ a: 1 });
	});

	it("get returns null for a missing key", () => {
		stubRoaming();
		expect(roamingGet("nope")).toBeNull();
	});

	it("saveAsync persists and resolves", async () => {
		const { saveAsync } = stubRoaming();
		roamingSet("k", 1);
		await roamingSave();
		expect(saveAsync).toHaveBeenCalledTimes(1);
	});

	it("rejects when saveAsync fails", async () => {
		stubRoaming({}, true);
		await expect(roamingSave()).rejects.toThrow();
	});

	it("saveFreeProfile writes the profile and persists; loadFreeProfile reads it back", async () => {
		const { saveAsync } = stubRoaming();
		await saveFreeProfile(PROFILE);
		expect(saveAsync).toHaveBeenCalled();
		const back = await loadFreeProfile();
		expect(back).toEqual(PROFILE);
	});

	it("loadFreeProfile returns null when none is stored", async () => {
		stubRoaming();
		expect(await loadFreeProfile()).toBeNull();
	});
});
