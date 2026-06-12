import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	addCategoryToOpenItem,
	ensureMasterCategory,
	labelOpenItem,
	listMasterCategories,
} from "../src/office/categories";

type Cb<T> = (res: { status: string; value?: T }) => void;

function stubOffice(existing: { displayName: string; color: string }[] = []) {
	const masterGet = vi.fn((cb: Cb<{ displayName: string; color: string }[]>) =>
		cb({ status: "succeeded", value: existing }),
	);
	const masterAdd = vi.fn((_c: unknown, cb: Cb<void>) =>
		cb({ status: "succeeded" }),
	);
	const itemAdd = vi.fn((_c: unknown, cb: Cb<void>) =>
		cb({ status: "succeeded" }),
	);
	vi.stubGlobal("Office", {
		AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
		context: {
			mailbox: {
				masterCategories: { getAsync: masterGet, addAsync: masterAdd },
				item: { categories: { addAsync: itemAdd } },
			},
		},
	});
	return { masterGet, masterAdd, itemAdd };
}

describe("office categories (native, no Graph)", () => {
	beforeEach(() => vi.unstubAllGlobals());

	it("lists the master categories", async () => {
		stubOffice([{ displayName: "Glean/FYI", color: "preset3" }]);
		const cats = await listMasterCategories();
		expect(cats).toEqual([{ displayName: "Glean/FYI", color: "preset3" }]);
	});

	it("ensureMasterCategory creates it when missing", async () => {
		const { masterAdd } = stubOffice([]);
		await ensureMasterCategory("Glean/To respond", "preset0");
		expect(masterAdd).toHaveBeenCalledTimes(1);
		// Resolved to the capitalized enum member name (Outlook rejects "preset0").
		expect(masterAdd.mock.calls[0][0]).toEqual([
			{ displayName: "Glean/To respond", color: "Preset0" },
		]);
	});

	it("ensureMasterCategory is a no-op when it already exists (case-insensitive)", async () => {
		const { masterAdd } = stubOffice([
			{ displayName: "Glean/To respond", color: "preset0" },
		]);
		await ensureMasterCategory("glean/to respond", "preset0");
		expect(masterAdd).not.toHaveBeenCalled();
	});

	it("adds a category to the open item", async () => {
		const { itemAdd } = stubOffice();
		await addCategoryToOpenItem("Glean/To respond");
		expect(itemAdd.mock.calls[0][0]).toEqual(["Glean/To respond"]);
	});

	it("labelOpenItem applies the category directly (free permission — no master-list call)", async () => {
		const { masterAdd, itemAdd } = stubOffice([]);
		await labelOpenItem("Glean/Meetings");
		// masterCategories needs ReadWriteMailbox (admin) — the free path must not call it.
		expect(masterAdd).not.toHaveBeenCalled();
		expect(itemAdd.mock.calls[0][0]).toEqual(["Glean/Meetings"]);
	});

	it("rejects when Office reports failure", async () => {
		vi.stubGlobal("Office", {
			AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
			context: {
				mailbox: {
					item: {
						categories: {
							addAsync: (_c: unknown, cb: Cb<void>) => cb({ status: "failed" }),
						},
					},
				},
			},
		});
		await expect(addCategoryToOpenItem("X")).rejects.toThrow();
	});
});
