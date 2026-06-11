// A1+A2 demo pane — proves the foundation + intelligence chains end to end.
// Ugly is fine; A4 replaces all UI.
import { useRef, useState, type CSSProperties } from "react";
import { getOpenMessage, type OpenMessage } from "./office/context";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import { graph } from "./graph/client";
import { getMessageByInternetId, htmlToText } from "./graph/mail";
import { store, ConflictError } from "./store/onedrive";
import { ProfileV1, type Profile } from "./store/schemas";
import { FeedbackQueueV1, type FeedbackQueue } from "./store/schemas";
import { ensureCategory } from "./graph/categories";
import { clearNavKey, getNavKey, setNavKey } from "./llm/key";
import { chat, chatStream, NeedsKeyError } from "./llm/navigator";
import { pickDraftModel, DRAFT_MODEL } from "./llm/models";
import { runDraft, type DraftDeps, type DraftResult, type FeedbackEntry } from "./draft/pipeline";

const box: CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: 12,
  marginBottom: 12,
};

function Demo() {
  const { account, signIn, signOut } = useAuth();
  const [msg] = useState<OpenMessage | null>(() => getOpenMessage());
  const [me, setMe] = useState<string>("");
  const [bodyPreview, setBodyPreview] = useState<string>("");
  const [storeResult, setStoreResult] = useState<string>("");
  const [categoryResult, setCategoryResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function handleSignIn() {
    setError("");
    try {
      await signIn();
      const profile = await graph<{ displayName: string }>("GET", "/me");
      setMe(profile.displayName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign-in failed");
    }
  }

  async function handleReadBody() {
    setError("");
    try {
      if (!msg?.internetMessageId) throw new Error("No open message");
      const full = await getMessageByInternetId(msg.internetMessageId);
      if (!full?.body) throw new Error("Message not found via Graph");
      setBodyPreview(htmlToText(full.body.content).slice(0, 200));
    } catch (e) {
      setError(e instanceof Error ? e.message : "read failed");
    }
  }

  async function handleStoreSelfTest() {
    setError("");
    setStoreResult("running…");
    try {
      const skeleton: Profile = {
        version: 1,
        updated_at: new Date().toISOString(),
        style_clusters: [],
        formality_prior: null,
        exemplars: [],
        watermarks: {},
      };
      const { etag } = await store.write("profile.json", ProfileV1, skeleton);
      const back = await store.read("profile.json", ProfileV1);
      if (!back) throw new Error("read-after-write returned null");
      let conflictSeen = false;
      try {
        await store.write("profile.json", ProfileV1, skeleton, '"stale-etag-on-purpose"');
      } catch (e) {
        conflictSeen = e instanceof ConflictError;
      }
      setStoreResult(
        `round-trip ok (etag ${etag.slice(0, 12)}…) · ConflictError on stale etag: ${conflictSeen ? "✓" : "✗"}`
      );
    } catch (e) {
      setStoreResult("");
      setError(e instanceof Error ? e.message : "store self-test failed");
    }
  }

  async function handleCategoryTest() {
    setError("");
    try {
      const cat = await ensureCategory("Glean/To respond", "preset0");
      setCategoryResult(`ensured "${cat.displayName}" (${cat.color})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "category test failed");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif", fontSize: 14 }}>
      <h2>Local Glean — A1 self-test</h2>

      <div style={box}>
        <strong>Open message (Office.js)</strong>
        {msg ? (
          <ul>
            <li>Subject: {msg.subject}</li>
            <li>
              From: {msg.senderName} &lt;{msg.senderEmail}&gt;
            </li>
          </ul>
        ) : (
          <p>No message selected (or running outside Outlook).</p>
        )}
      </div>

      <div style={box}>
        <strong>Sign-in (MSAL → Entra)</strong>
        <p>
          {account ? (
            <>
              {me || account.username}{" "}
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" onClick={handleSignIn}>
              Sign in with UF account
            </button>
          )}
        </p>
      </div>

      <div style={box}>
        <strong>Graph mail read</strong>
        <p>
          <button type="button" onClick={handleReadBody} disabled={!account || !msg}>
            Read open message body via Graph
          </button>
        </p>
        {bodyPreview && <p style={{ color: "#333" }}>{bodyPreview}…</p>}
      </div>

      <div style={box}>
        <strong>OneDrive approot store</strong>
        <p>
          <button type="button" onClick={handleStoreSelfTest} disabled={!account}>
            Run store self-test (write → read → conflict)
          </button>
        </p>
        {storeResult && <p>{storeResult}</p>}
      </div>

      <div style={box}>
        <strong>Outlook categories</strong>
        <p>
          <button type="button" onClick={handleCategoryTest} disabled={!account}>
            Ensure "Glean/To respond" category
          </button>
        </p>
        {categoryResult && <p>{categoryResult}</p>}
      </div>

      <A2DraftDemo account={!!account} msg={msg} />

      {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
    </div>
  );
}

// --- A2 demo: NaviGator key + real draft pipeline (temporary; A4 replaces) --
function A2DraftDemo({ account, msg }: { account: boolean; msg: OpenMessage | null }) {
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState(getNavKey() ? "key set (this session)" : "");
  const [modelId, setModelId] = useState<string>(DRAFT_MODEL);
  const [streaming, setStreaming] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function handleSetKey() {
    setError("");
    try {
      // setNavKey is the ONLY place an Authorization header is built from the
      // key; it returns the live model ids so we never re-fetch with it here.
      const { count, modelIds } = await setNavKey(keyInput);
      setKeyInput(""); // drop the plaintext from React state immediately
      setModelId(pickDraftModel(modelIds) ?? DRAFT_MODEL);
      setKeyStatus(`validated — ${count} models visible`);
    } catch (e) {
      setKeyStatus("");
      setError(e instanceof Error ? e.message : "key validation failed");
    }
  }

  function buildDeps(): DraftDeps {
    return {
      fetchMessage: (id) => getMessageByInternetId(id),
      loadProfile: async () => {
        // Minimal profile until A3 builds the real one from sent mail.
        const stored = await store.read("profile.json", ProfileV1).catch(() => null);
        void stored;
        return {
          summary: "",
          bannedPhrases: [],
          userSignoffs: [],
          userFullName: Office?.context?.mailbox?.userProfile?.displayName ?? "",
          exemplarPools: { t1: [], t2: [], t3: [] },
        };
      },
      loadCard: async () => null, // relationships.json lands in A3 -> cold-start path
      chatStream: (opts) => chatStream({ ...opts, model: modelId }),
      chat: (opts) => chat({ ...opts, model: modelId, temperature: 0 }),
      appendFeedback: async (entry: FeedbackEntry) => {
        const existing = await store.read("feedback-queue.json", FeedbackQueueV1).catch(() => null);
        const queue: FeedbackQueue = existing?.data ?? { version: 1, entries: [] };
        queue.entries.push(entry);
        await store.write("feedback-queue.json", FeedbackQueueV1, queue, existing?.etag);
      },
    };
  }

  async function handleDraft() {
    setError("");
    setStreaming("");
    setResult(null);
    setElapsedMs(null);
    setBusy(true);
    startedAt.current = performance.now();
    try {
      if (!msg) throw new Error("No open message");
      const out = await runDraft({ message: msg }, buildDeps(), (delta) =>
        setStreaming((s) => s + delta),
      );
      setElapsedMs(Math.round(performance.now() - startedAt.current));
      setResult(out);
    } catch (e) {
      if (e instanceof NeedsKeyError) setError("Set your NaviGator key first.");
      else setError(e instanceof Error ? e.message : "draft failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={box}>
      <strong>A2 — NaviGator key + draft pipeline</strong>
      <p>
        <input
          type="password"
          placeholder="NaviGator API key (sessionStorage only)"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          style={{ width: 260 }}
        />{" "}
        <button type="button" onClick={handleSetKey} disabled={!keyInput}>
          Validate &amp; set key
        </button>{" "}
        <button type="button" onClick={() => { clearNavKey(); setKeyStatus(""); }}>
          Clear key
        </button>
      </p>
      {keyStatus && <p>{keyStatus} · draft model: {modelId}</p>}
      <p>
        <button type="button" onClick={handleDraft} disabled={!account || !msg || busy}>
          {busy ? "Drafting…" : "Draft reply for open message"}
        </button>
        {elapsedMs !== null && <> · {elapsedMs} ms</>}
      </p>
      {streaming && (
        <>
          <em>streamed body:</em>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 8 }}>{streaming}</pre>
        </>
      )}
      {result && (
        <>
          <em>
            wrapped result (register {result.register}, tiers {result.exemplarTiers.join(",")})
            {" — verifier "}
            {result.verifier.passed ? "PASSED" : "FAILED"}
          </em>
          <pre style={{ whiteSpace: "pre-wrap", background: "#eef6ee", padding: 8 }}>{result.text}</pre>
          {!result.verifier.passed && (
            <>
              <pre style={{ whiteSpace: "pre-wrap", background: "#fdecea", padding: 8 }}>
                {result.verifier.reasons.join("\n")}
              </pre>
              <button type="button" onClick={() => undefined} title="Explicit override — draft is never auto-sent">
                Use anyway
              </button>
            </>
          )}
        </>
      )}
      {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Demo />
    </AuthProvider>
  );
}
