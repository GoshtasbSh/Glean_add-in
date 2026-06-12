import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LABELS, getLabels, saveLabels } from "../src/store/labels";

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

afterEach(() => vi.unstubAllGlobals());

describe("labels store", () => {
	it("returns the default Fyxer-style set when nothing is saved", () => {
		stubRoaming();
		expect(getLabels()).toEqual(DEFAULT_LABELS);
		expect(getLabels().map((l) => l.name)).toContain("To respond");
		expect(getLabels().map((l) => l.name)).toContain("Marketing");
	});

	it("persists a custom set and reloads it (deduped by name, trimmed)", async () => {
		stubRoaming();
		await saveLabels([
			{ name: "  Finance  ", desc: " money " },
			{ name: "finance", desc: "dup — dropped" },
			{ name: "Travel", desc: "trips" },
		]);
		expect(getLabels()).toEqual([
			{ name: "Finance", desc: "money" },
			{ name: "Travel", desc: "trips" },
		]);
	});

	it("falls back to defaults outside Office (browser/tests)", () => {
		expect(getLabels()).toEqual(DEFAULT_LABELS);
	});
});
