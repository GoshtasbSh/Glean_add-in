import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { GraphError, type GraphFn } from "../src/graph/client";
import { ConflictError, createStore } from "../src/store/onedrive";
import { ProfileV1, SettingsV1 } from "../src/store/schemas";

// A3-tightened empty profile (schemas.test.ts covers the full shapes).
const PROFILE_SKELETON = {
	version: 1 as const,
	updated_at: "2026-06-10T00:00:00Z",
	summary: "",
	bannedPhrases: [],
	userSignoffs: [],
	userFullName: "",
	style_clusters: [],
	formality_prior: null,
	exemplars: [],
	watermarks: {},
};

describe("schemas", () => {
	it("ProfileV1 accepts the skeleton", () => {
		expect(ProfileV1.parse(PROFILE_SKELETON)).toEqual(PROFILE_SKELETON);
	});

	it("ProfileV1 rejects a wrong version", () => {
		expect(() => ProfileV1.parse({ ...PROFILE_SKELETON, version: 2 })).toThrow(
			ZodError,
		);
	});

	it("ProfileV1 rejects missing fields", () => {
		const incomplete: Record<string, unknown> = { ...PROFILE_SKELETON };
		delete incomplete.watermarks;
		expect(() => ProfileV1.parse(incomplete)).toThrow(ZodError);
	});

	it("SettingsV1 accepts its skeleton", () => {
		const s = {
			version: 1 as const,
			labels: [],
			rules: [],
			category_map: { "Glean/To respond": "preset0" },
			project_rules: [],
		};
		expect(SettingsV1.parse(s)).toEqual(s);
	});
});

describe("onedrive store", () => {
	it("read returns parsed data and etag", async () => {
		const graphFn = vi.fn(
			async (method: string, path: string, opts?: { raw?: boolean }) => {
				if (path.endsWith(":/content") && opts?.raw) {
					return new Response(JSON.stringify(PROFILE_SKELETON), {
						status: 200,
					});
				}
				return { eTag: '"etag-1"' };
			},
		) as unknown as GraphFn;

		const store = createStore(graphFn);
		const result = await store.read("profile.json", ProfileV1);
		expect(result).not.toBeNull();
		expect(result!.data).toEqual(PROFILE_SKELETON);
		expect(result!.etag).toBe('"etag-1"');
	});

	it("read returns null on 404", async () => {
		const graphFn = vi.fn(async () => {
			throw new GraphError(404, "itemNotFound");
		}) as unknown as GraphFn;
		const store = createStore(graphFn);
		expect(await store.read("profile.json", ProfileV1)).toBeNull();
	});

	it("read rejects corrupt JSON via schema validation", async () => {
		const graphFn = vi.fn(
			async (_m: string, path: string, opts?: { raw?: boolean }) => {
				if (path.endsWith(":/content") && opts?.raw) {
					return new Response(JSON.stringify({ totally: "wrong" }), {
						status: 200,
					});
				}
				return { eTag: '"e"' };
			},
		) as unknown as GraphFn;
		const store = createStore(graphFn);
		await expect(store.read("profile.json", ProfileV1)).rejects.toThrow(
			ZodError,
		);
	});

	it("write PUTs validated JSON and returns the new etag", async () => {
		const graphFn = vi.fn(async () => ({
			eTag: '"etag-2"',
		})) as unknown as GraphFn;
		const store = createStore(graphFn);
		const { etag } = await store.write(
			"profile.json",
			ProfileV1,
			PROFILE_SKELETON,
		);
		expect(etag).toBe('"etag-2"');
		const [method, path, opts] = (graphFn as ReturnType<typeof vi.fn>).mock
			.calls[0];
		expect(method).toBe("PUT");
		expect(path).toBe("/me/drive/special/approot:/profile.json:/content");
		expect(opts.body).toEqual(PROFILE_SKELETON);
	});

	it("write passes If-Match when an etag is given", async () => {
		const graphFn = vi.fn(async () => ({
			eTag: '"etag-3"',
		})) as unknown as GraphFn;
		const store = createStore(graphFn);
		await store.write("profile.json", ProfileV1, PROFILE_SKELETON, '"etag-2"');
		const [, , opts] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(opts.headers["If-Match"]).toBe('"etag-2"');
	});

	it("write with a stale etag throws ConflictError on 412", async () => {
		const graphFn = vi.fn(async () => {
			throw new GraphError(412, "preconditionFailed");
		}) as unknown as GraphFn;
		const store = createStore(graphFn);
		await expect(
			store.write("profile.json", ProfileV1, PROFILE_SKELETON, '"stale"'),
		).rejects.toThrow(ConflictError);
	});

	it("write validates BEFORE calling Graph (invalid data never leaves the client)", async () => {
		const graphFn = vi.fn() as unknown as GraphFn;
		const store = createStore(graphFn);
		await expect(
			store.write("profile.json", ProfileV1, { bad: true } as never),
		).rejects.toThrow(ZodError);
		expect(graphFn).not.toHaveBeenCalled();
	});

	it("list returns children of a folder", async () => {
		const graphFn = vi.fn(async () => ({
			value: [{ name: "a.json" }, { name: "b.json" }],
		})) as unknown as GraphFn;
		const store = createStore(graphFn);
		const children = await store.list("projects");
		expect(children.map((c) => c.name)).toEqual(["a.json", "b.json"]);
		const [method, path] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(method).toBe("GET");
		expect(path).toBe("/me/drive/special/approot:/projects:/children");
	});

	it("ensureFolder swallows nameAlreadyExists conflicts", async () => {
		const graphFn = vi.fn(async () => {
			throw new GraphError(409, "nameAlreadyExists");
		}) as unknown as GraphFn;
		const store = createStore(graphFn);
		await expect(store.ensureFolder("projects")).resolves.toBeUndefined();
	});

	it("rejects unsafe paths before any Graph call (traversal guard)", async () => {
		const graphFn = vi.fn() as unknown as GraphFn;
		const store = createStore(graphFn);
		await expect(store.read("../settings.json", ProfileV1)).rejects.toThrow(
			/unsafe/i,
		);
		await expect(
			store.write("/absolute.json", ProfileV1, PROFILE_SKELETON),
		).rejects.toThrow(/unsafe/i);
		await expect(store.del("a/../../b.json")).rejects.toThrow(/unsafe/i);
		await expect(store.list("../../root")).rejects.toThrow(/unsafe/i);
		expect(graphFn).not.toHaveBeenCalled();
	});

	it("del issues a DELETE for the path", async () => {
		const graphFn = vi.fn(async () => undefined) as unknown as GraphFn;
		const store = createStore(graphFn);
		await store.del("feedback-queue.json");
		const [method, path] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(method).toBe("DELETE");
		expect(path).toBe("/me/drive/special/approot:/feedback-queue.json");
	});
});
