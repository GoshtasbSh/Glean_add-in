import { describe, it, expect, vi } from "vitest";
import { listCategories, ensureCategory, assignCategories } from "../src/graph/categories";
import type { GraphFn } from "../src/graph/client";

const EXISTING = [
  { id: "cat-1", displayName: "Glean/To respond", color: "preset0" },
  { id: "cat-2", displayName: "Glean/FYI", color: "preset3" },
];

describe("listCategories", () => {
  it("returns the master category list", async () => {
    const graphFn = vi.fn(async () => ({ value: EXISTING })) as unknown as GraphFn;
    const cats = await listCategories(graphFn);
    expect(cats).toEqual(EXISTING);
    const [method, path] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(method).toBe("GET");
    expect(path).toBe("/me/outlook/masterCategories");
  });
});

describe("ensureCategory", () => {
  it("returns the existing category without creating (case-insensitive)", async () => {
    const graphFn = vi.fn(async () => ({ value: EXISTING })) as unknown as GraphFn;
    const cat = await ensureCategory("glean/to respond", "preset0", graphFn);
    expect(cat.id).toBe("cat-1");
    expect(graphFn).toHaveBeenCalledTimes(1); // GET only, no POST
  });

  it("creates the category when missing", async () => {
    const created = { id: "cat-9", displayName: "Glean/Meetings", color: "preset5" };
    const graphFn = vi.fn(async (method: string) =>
      method === "GET" ? { value: EXISTING } : created
    ) as unknown as GraphFn;
    const cat = await ensureCategory("Glean/Meetings", "preset5", graphFn);
    expect(cat).toEqual(created);
    const [method, path, opts] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(method).toBe("POST");
    expect(path).toBe("/me/outlook/masterCategories");
    expect(opts.body).toEqual({ displayName: "Glean/Meetings", color: "preset5" });
  });
});

describe("assignCategories", () => {
  it("PATCHes the message with the category names", async () => {
    const graphFn = vi.fn(async () => ({})) as unknown as GraphFn;
    await assignCategories("AAMk-123", ["Glean/To respond"], graphFn);
    const [method, path, opts] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(method).toBe("PATCH");
    expect(path).toBe("/me/messages/AAMk-123");
    expect(opts.body).toEqual({ categories: ["Glean/To respond"] });
  });

  it("URL-encodes the message id", async () => {
    const graphFn = vi.fn(async () => ({})) as unknown as GraphFn;
    await assignCategories("AAMk+abc/def=", ["Glean/FYI"], graphFn);
    const [, path] = (graphFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe(`/me/messages/${encodeURIComponent("AAMk+abc/def=")}`);
  });
});
