/**
 * NaviGator browser client — SSE delta assembly, abort mid-stream, 429/5xx
 * retry with backoff, NeedsKeyError, embed batching. All fetches mocked;
 * request/response bodies are never logged (no-log rule asserted).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_KEY_STORAGE_KEY } from "../src/llm/key";
import { NeedsKeyError, chat, chatStream, embed } from "../src/llm/navigator";
import { pickDraftModel, pickEmbedModel } from "../src/llm/models";

const KEY = "sk-test-key";
const encoder = new TextEncoder();

function sseResponse(events: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(encoder.encode(e));
      c.close();
    },
  });
  return new Response(stream, { status });
}

function chunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

beforeEach(() => {
  sessionStorage.setItem(NAV_KEY_STORAGE_KEY, KEY);
});
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

const OPTS = { model: "llama-3.3-70b-instruct", system: "sys", user: "hi", retryBaseMs: 1 };

describe("chatStream", () => {
  it("assembles deltas across split SSE frames and stops at [DONE]", async () => {
    // frame split mid-line exercises the buffer
    const full = chunk("Hel") + chunk("lo ") + chunk("world") + "data: [DONE]\n\n";
    const a = full.slice(0, 25);
    const b = full.slice(25);
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([a, b])));
    const out: string[] = [];
    for await (const d of chatStream(OPTS)) out.push(d);
    expect(out.join("")).toBe("Hello world");
  });

  it("sends Bearer auth + stream:true and never logs bodies", async () => {
    const logSpy = vi.spyOn(console, "log");
    const errSpy = vi.spyOn(console, "error");
    const fetchMock = vi.fn(async () => sseResponse([chunk("x"), "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    for await (const d of chatStream(OPTS)) void d;
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]);
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("Bearer");
      expect(JSON.stringify(call)).not.toContain('"hi"');
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("aborts mid-stream", async () => {
    const controller = new AbortController();
    const never = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(chunk("first")));
        // never closes
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        const signal = init?.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            async start(c) {
              const reader = never.getReader();
              const { value } = await reader.read();
              if (value) c.enqueue(value);
              signal?.addEventListener("abort", () => c.error(new DOMException("Aborted", "AbortError")));
            },
          }),
          { status: 200 },
        );
      }),
    );
    const out: string[] = [];
    await expect(async () => {
      for await (const d of chatStream({ ...OPTS, abort: controller.signal })) {
        out.push(d);
        controller.abort();
      }
    }).rejects.toThrow();
    expect(out).toEqual(["first"]);
  });

  it("retries on 429 then succeeds (max 3 attempts)", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls < 3) return new Response("rate limited", { status: 429 });
        return sseResponse([chunk("ok"), "data: [DONE]\n\n"]);
      }),
    );
    const out: string[] = [];
    for await (const d of chatStream(OPTS)) out.push(d);
    expect(out.join("")).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after 3 attempts on persistent 5xx without leaking the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret upstream detail", { status: 503 })));
    let err: Error | null = null;
    try {
      for await (const d of chatStream(OPTS)) void d;
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message).toContain("503");
    expect(err?.message).not.toContain("secret upstream detail");
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });

  it("does not retry on 400 (client error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    await expect(async () => {
      for await (const d of chatStream(OPTS)) void d;
    }).rejects.toThrow(/400/);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("throws typed NeedsKeyError when no key is set", async () => {
    sessionStorage.clear();
    await expect(async () => {
      for await (const d of chatStream(OPTS)) void d;
    }).rejects.toBeInstanceOf(NeedsKeyError);
  });
});

describe("chat", () => {
  it("returns the full completion content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "full reply" } }] }), {
          status: 200,
        }),
      ),
    );
    expect(await chat({ model: "m", system: "s", user: "u", retryBaseMs: 1 })).toBe("full reply");
  });
});

describe("embed", () => {
  it("batches 32 texts per request and preserves order", async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          data: body.input.map((t: string, i: number) => ({ index: i, embedding: [t.length, i] })),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const texts = Array.from({ length: 70 }, (_, i) => "t".repeat(i + 1));
    const out = await embed(texts, { retryBaseMs: 1 });
    expect(fetchMock.mock.calls).toHaveLength(3); // 32 + 32 + 6
    expect(out).toHaveLength(70);
    expect(out[0]).toEqual([1, 0]);
    expect(out[32]).toEqual([33, 0]); // first item of batch 2
  });

  it("throws NeedsKeyError without a key", async () => {
    sessionStorage.clear();
    await expect(embed(["x"])).rejects.toBeInstanceOf(NeedsKeyError);
  });
});

describe("models", () => {
  it("picks the Llama-3.3-70B draft model and nomic embed model from a live list", () => {
    const ids = ["gemma-3-27b-it", "llama-3.3-70b-instruct", "nomic-embed-text-v1.5", "whisper-1"];
    expect(pickDraftModel(ids)).toBe("llama-3.3-70b-instruct");
    expect(pickEmbedModel(ids)).toBe("nomic-embed-text-v1.5");
  });
  it("returns null when nothing matches", () => {
    expect(pickDraftModel(["foo"])).toBeNull();
    expect(pickEmbedModel(["foo"])).toBeNull();
  });
});
