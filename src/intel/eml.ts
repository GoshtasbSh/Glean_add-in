/**
 * Minimal RFC 822 / MIME parser for uploaded `.eml` files — the free-mode way
 * to feed your own sent mail into voice training with NO Microsoft Graph. The
 * file is parsed in-browser, in memory, and discarded; nothing is stored.
 *
 * Scope: the shapes Outlook actually exports — header block + body, optional
 * multipart/alternative (we take text/plain, else text/html), quoted-printable
 * and base64 transfer encodings, and RFC 2047 encoded-words in headers.
 */
import type { GraphMessage } from "../graph/mail";

const utf8 = new TextDecoder("utf-8");

function qpToBytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "=") {
      const hex = s.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
      }
      // `=` at end of line (soft break) or stray `=`: skip the `=`.
    } else {
      bytes.push(c.charCodeAt(0) & 0xff);
    }
  }
  return bytes;
}

function decodeQuotedPrintable(s: string): string {
  // Remove soft line breaks ("=" right before a newline) first.
  const joined = s.replace(/=\r?\n/g, "");
  return utf8.decode(new Uint8Array(qpToBytes(joined)));
}

function decodeBase64(s: string): string {
  try {
    const bin = atob(s.replace(/\s+/g, ""));
    const bytes = new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
    return utf8.decode(bytes);
  } catch {
    return s;
  }
}

/** RFC 2047 encoded-words: =?charset?Q|B?text?= (used in Subject, From names). */
function decodeEncodedWords(s: string): string {
  return s.replace(/=\?[^?]+\?([QqBb])\?([^?]*)\?=/g, (_m, enc: string, text: string) => {
    if (enc.toUpperCase() === "B") return decodeBase64(text);
    // Q-encoding: like QP but "_" means space.
    return utf8.decode(new Uint8Array(qpToBytes(text.replace(/_/g, " "))));
  });
}

interface Headers {
  get(name: string): string;
}

function parseHeaders(block: string): Headers {
  const map = new Map<string, string>();
  // Unfold continuation lines (start with space/tab) onto the previous header.
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!map.has(key)) map.set(key, val);
  }
  return { get: (n) => map.get(n.toLowerCase()) ?? "" };
}

function splitHeaderBody(raw: string): { headerBlock: string; body: string } {
  const m = raw.match(/\r?\n\r?\n/);
  if (m && m.index !== undefined) {
    return { headerBlock: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
  }
  // No blank-line separator: treat as headers only if it starts like a header
  // field, otherwise it's a bare body (robustness for pasted/odd input).
  if (/^[^\s:]+:/.test(raw)) return { headerBlock: raw, body: "" };
  return { headerBlock: "", body: raw };
}

function parseAddress(raw: string): { name?: string; address: string } {
  const decoded = decodeEncodedWords(raw).trim();
  const angle = decoded.match(/^(.*)<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"|"$/g, "").trim();
    return { name: name || undefined, address: angle[2].trim() };
  }
  return { address: decoded.replace(/^"|"$/g, "").trim() };
}

function decodePart(body: string, encoding: string): string {
  const enc = encoding.toLowerCase();
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  if (enc === "base64") return decodeBase64(body);
  return body;
}

function pickBody(headers: Headers, body: string): { contentType: "text" | "html"; content: string } {
  const ct = headers.get("content-type").toLowerCase();
  const boundaryMatch = headers.get("content-type").match(/boundary="?([^";]+)"?/i);
  if (ct.startsWith("multipart/") && boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = body.split(`--${boundary}`);
    const parsed = parts
      .map((p) => splitHeaderBody(p.replace(/^\r?\n/, "")))
      .map((p) => ({ h: parseHeaders(p.headerBlock), raw: p.body }))
      .filter((p) => p.h.get("content-type").toLowerCase().startsWith("text/"));
    const plain = parsed.find((p) => p.h.get("content-type").toLowerCase().startsWith("text/plain"));
    const chosen = plain ?? parsed[0];
    if (chosen) {
      const content = decodePart(chosen.raw, chosen.h.get("content-transfer-encoding")).trim();
      const isHtml = chosen.h.get("content-type").toLowerCase().startsWith("text/html");
      return { contentType: isHtml ? "html" : "text", content };
    }
  }
  const content = decodePart(body, headers.get("content-transfer-encoding"));
  return { contentType: ct.startsWith("text/html") ? "html" : "text", content };
}

export function parseEml(raw: string): GraphMessage {
  const { headerBlock, body } = splitHeaderBody(raw);
  const headers = parseHeaders(headerBlock);

  const fromRaw = headers.get("from");
  const from = fromRaw ? { emailAddress: parseAddress(fromRaw) } : undefined;
  const toRecipients = headers
    .get("to")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ emailAddress: parseAddress(s) }));

  const dateRaw = headers.get("date");
  let sentDateTime: string | undefined;
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) sentDateTime = d.toISOString();
  }

  return {
    id: headers.get("message-id") || headers.get("subject") || "eml",
    subject: decodeEncodedWords(headers.get("subject")),
    from,
    toRecipients: toRecipients.length ? toRecipients : undefined,
    sentDateTime,
    receivedDateTime: sentDateTime,
    conversationId: headers.get("message-id") || undefined,
    body: pickBody(headers, body),
  };
}
