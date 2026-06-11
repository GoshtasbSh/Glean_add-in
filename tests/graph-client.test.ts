import { describe, it, expect, vi } from "vitest";
import { createGraphClient, GraphError } from "../src/graph/client";

const instantSleep = async () => {};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("graph client", () => {
  it("adds the bearer token and parses JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { displayName: "Albert" }));
    const client = createGraphClient({
      getToken: async () => "tok-123",
      fetchFn,
      sleep: instantSleep,
    });
    const me = await client.graph<{ displayName: string }>("GET", "/me");
    expect(me.displayName).toBe("Albert");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me");
    expect(init.headers.Authorization).toBe("Bearer tok-123");
  });

  it("sends a JSON body on POST", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { id: "x" }));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: instantSleep,
    });
    await client.graph("POST", "/me/outlook/masterCategories", {
      body: { displayName: "Glean/To respond" },
    });
    const [, init] = fetchFn.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ displayName: "Glean/To respond" });
  });

  it("retries on 429 honoring Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const out = await client.graph<{ ok: boolean }>("GET", "/me");
    expect(out.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
  });

  it("retries on 503 with exponential backoff when Retry-After is absent", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.graph("GET", "/me");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps.length).toBe(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  it("gives up after 3 retries and throws GraphError", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(429, {}, { "Retry-After": "0" }));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: instantSleep,
    });
    await expect(client.graph("GET", "/me")).rejects.toThrow(GraphError);
    expect(fetchFn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it("on 401 refreshes the token once and retries", async () => {
    const tokens = ["stale-token", "fresh-token"];
    const getToken = vi.fn(async () => tokens.shift() ?? "fresh-token");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "InvalidAuthenticationToken" } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = createGraphClient({ getToken, fetchFn, sleep: instantSleep });
    const out = await client.graph<{ ok: boolean }>("GET", "/me");
    expect(out.ok).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh-token");
  });

  it("a second consecutive 401 throws (no infinite refresh loop)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: instantSleep,
    });
    await expect(client.graph("GET", "/me")).rejects.toThrow(GraphError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("GraphError carries status and code but never the response body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(403, {
        error: { code: "ErrorAccessDenied", message: "FERPA-sensitive secret body content" },
      })
    );
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: instantSleep,
    });
    try {
      await client.graph("GET", "/me/messages/abc");
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as GraphError;
      expect(err).toBeInstanceOf(GraphError);
      expect(err.status).toBe(403);
      expect(err.code).toBe("ErrorAccessDenied");
      expect(err.message).not.toContain("secret body content");
    }
  });

  it("returns the raw Response when opts.raw is set", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("binary", { status: 200 }));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: instantSleep,
    });
    const res = await client.graph<Response>("GET", "/me/photo/$value", { raw: true });
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toBe("binary");
  });

  it("returns undefined for 204 No Content", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createGraphClient({
      getToken: async () => "tok",
      fetchFn,
      sleep: instantSleep,
    });
    const out = await client.graph("DELETE", "/me/drive/items/x");
    expect(out).toBeUndefined();
  });
});
