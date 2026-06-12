import { describe, it, expect, vi } from "vitest";
import { createFreeFitDeps } from "../src/intel/freeFitDeps";
import { createMemStore } from "../src/store/memStore";
import type { GraphMessage } from "../src/graph/mail";

const MSGS: GraphMessage[] = [
  { id: "1", subject: "a", body: { contentType: "text", content: "hi" } },
  { id: "2", subject: "b", body: { contentType: "text", content: "yo" } },
];

describe("createFreeFitDeps", () => {
  it("listSent returns the uploaded corpus (ignores the since watermark) and reports the page", async () => {
    const store = createMemStore();
    const onPage = vi.fn();
    const deps = createFreeFitDeps({ messages: MSGS, store, userFullName: "G" });
    const out = await deps.listSent("1970-01-01T00:00:00Z", { cap: 1500, onPage });
    expect(out).toEqual(MSGS);
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("embed delegates to the injected NaviGator embed", async () => {
    const store = createMemStore();
    const embed = vi.fn(async (t: string[]) => t.map(() => [0.1, 0.2]));
    const deps = createFreeFitDeps({ messages: MSGS, store, userFullName: "G", embed });
    const vecs = await deps.embed(["x", "y"]);
    expect(vecs).toEqual([[0.1, 0.2], [0.1, 0.2]]);
    expect(embed).toHaveBeenCalled();
  });

  it("chat adapts {system,user} to the NaviGator model", async () => {
    const store = createMemStore();
    const chat = vi.fn(async () => '["Name"]');
    const deps = createFreeFitDeps({ messages: MSGS, store, userFullName: "G", chat });
    await deps.chat({ system: "S", user: "U" });
    const arg = chat.mock.calls[0][0];
    expect(arg.system).toBe("S");
    expect(arg.user).toBe("U");
    expect(arg.model).toBeTruthy();
  });

  it("passes the store and userFullName straight through", () => {
    const store = createMemStore();
    const deps = createFreeFitDeps({ messages: MSGS, store, userFullName: "Goshtasb" });
    expect(deps.store).toBe(store);
    expect(deps.userFullName).toBe("Goshtasb");
  });
});
