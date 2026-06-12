import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createMemStore } from "../src/store/memStore";
import { ConflictError } from "../src/store/onedrive";

const S = z.object({ n: z.number() });

describe("createMemStore (production in-memory Store)", () => {
  it("round-trips a schema-validated value with an etag", async () => {
    const store = createMemStore();
    const { etag } = await store.write("a.json", S, { n: 1 });
    const back = await store.read("a.json", S);
    expect(back?.data).toEqual({ n: 1 });
    expect(back?.etag).toBe(etag);
  });

  it("read returns null for a missing file", async () => {
    expect(await createMemStore().read("nope.json", S)).toBeNull();
  });

  it("bumps the etag on each write", async () => {
    const store = createMemStore();
    const a = await store.write("a.json", S, { n: 1 });
    const b = await store.write("a.json", S, { n: 2 });
    expect(a.etag).not.toBe(b.etag);
  });

  it("throws ConflictError on a stale If-Match etag", async () => {
    const store = createMemStore();
    await store.write("a.json", S, { n: 1 });
    await expect(store.write("a.json", S, { n: 2 }, '"stale"')).rejects.toThrow(ConflictError);
  });

  it("validates with the schema before storing", async () => {
    const store = createMemStore();
    await expect(store.write("a.json", S, { n: "x" } as never)).rejects.toThrow();
  });

  it("lists children of a folder and deletes", async () => {
    const store = createMemStore();
    await store.write("projects/p1.json", S, { n: 1 });
    await store.write("projects/p2.json", S, { n: 2 });
    expect((await store.list("projects")).map((c) => c.name).sort()).toEqual(["p1.json", "p2.json"]);
    await store.del("projects/p1.json");
    expect((await store.list("projects")).map((c) => c.name)).toEqual(["p2.json"]);
  });
});
