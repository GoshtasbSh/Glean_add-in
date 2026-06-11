/**
 * NaviGator browser client — OpenAI-compatible (LiteLLM-proxied vLLM) over
 * fetch. SESSION A2 §3.5.
 *
 * Hard rules:
 * - Key comes ONLY from getNavKey() (sessionStorage accessor); absent key
 *   throws the typed NeedsKeyError so the UI can prompt.
 * - Request/response bodies are NEVER logged (FERPA — they contain email
 *   content). Errors carry status codes only, never upstream body text.
 * - 429/5xx retried with exponential backoff, max 3 attempts total; 4xx
 *   (other than 429) fail immediately. Retries happen only before any
 *   streamed byte is consumed — a broken stream is never silently resumed.
 */
import { NAVIGATOR_BASE_URL, getNavKey } from "./key";

export class NeedsKeyError extends Error {
  constructor() {
    super("No NaviGator key is set for this session.");
    this.name = "NeedsKeyError";
  }
}

export class NavigatorHttpError extends Error {
  readonly status: number;
  constructor(status: number, attempts: number) {
    // No body text here — upstream error bodies can echo prompt content.
    super(`NaviGator request failed with HTTP ${status} after ${attempts} attempt(s).`);
    this.name = "NavigatorHttpError";
    this.status = status;
  }
}

export interface ChatOpts {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  abort?: AbortSignal;
  /** Backoff base in ms (default 500); tests pass 1. */
  retryBaseMs?: number;
}

const MAX_ATTEMPTS = 3;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function authHeaders(): Record<string, string> {
  const key = getNavKey();
  if (key === null) throw new NeedsKeyError();
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** POST with tenacity-style backoff on 429/5xx (max 3 attempts). */
async function postWithRetry(
  path: string,
  body: unknown,
  opts: { abort?: AbortSignal; retryBaseMs?: number },
): Promise<Response> {
  const headers = authHeaders(); // NeedsKeyError before any network traffic
  const base = opts.retryBaseMs ?? 500;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(`${NAVIGATOR_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.abort,
    });
    if (resp.ok) return resp;
    lastStatus = resp.status;
    const retryable = resp.status === 429 || resp.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new NavigatorHttpError(resp.status, attempt);
    }
    await sleep(base * 2 ** (attempt - 1), opts.abort);
  }
  throw new NavigatorHttpError(lastStatus, MAX_ATTEMPTS);
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null } }[];
}

/** Stream completion deltas. SSE `data:` lines, terminated by `data: [DONE]`. */
export async function* chatStream(opts: ChatOpts): AsyncGenerator<string> {
  const resp = await postWithRetry(
    "/chat/completions",
    {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature,
      stream: true,
    },
    opts,
  );
  if (resp.body === null) throw new NavigatorHttpError(resp.status, 1);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (opts.abort?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Parse complete lines; keep the remainder buffered (frames split mid-line).
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        let parsed: StreamChunk;
        try {
          parsed = JSON.parse(payload) as StreamChunk;
        } catch {
          continue; // defensive: skip malformed keep-alive/comment frames
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) yield delta;
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

/** Non-streaming completion (used by the verifier call). */
export async function chat(opts: ChatOpts): Promise<string> {
  const resp = await postWithRetry(
    "/chat/completions",
    {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature,
      stream: false,
    },
    opts,
  );
  const body = (await resp.json()) as ChatResponse;
  return body.choices?.[0]?.message?.content ?? "";
}

const EMBED_BATCH = 32;

interface EmbedResponse {
  data?: { index: number; embedding: number[] }[];
}

export interface EmbedOpts {
  model?: string;
  abort?: AbortSignal;
  retryBaseMs?: number;
}

/** Batch-embed texts (32 per request, order preserved). */
export async function embed(texts: readonly string[], opts: EmbedOpts = {}): Promise<number[][]> {
  if (getNavKey() === null) throw new NeedsKeyError();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const resp = await postWithRetry(
      "/embeddings",
      { model: opts.model ?? "nomic-embed-text", input: batch },
      opts,
    );
    const body = (await resp.json()) as EmbedResponse;
    const rows = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) {
      // Protocol mismatch on a 200 response — not an HTTP failure.
      throw new Error(
        `NaviGator embeddings returned ${rows.length} vectors for a batch of ${batch.length}.`,
      );
    }
    for (const row of rows) out.push(row.embedding);
  }
  return out;
}
