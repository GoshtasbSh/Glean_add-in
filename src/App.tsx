// A1 demo pane — proves the foundation chain end to end. Ugly is fine; A4
// replaces all UI.
import { useState, type CSSProperties } from "react";
import { getOpenMessage, type OpenMessage } from "./office/context";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import { graph } from "./graph/client";
import { getMessageByInternetId, htmlToText } from "./graph/mail";
import { store, ConflictError } from "./store/onedrive";
import { ProfileV1, type Profile } from "./store/schemas";
import { ensureCategory } from "./graph/categories";

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
