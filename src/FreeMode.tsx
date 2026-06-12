/**
 * Free-mode pane — works inside Outlook with NO Microsoft Graph, NO Entra
 * registration, NO admin consent:
 *   read the open email → draft a reply in your voice (NaviGator) → insert →
 *   label; plus "Train my voice" from your own uploaded .eml files.
 * Everything runs in the browser sandbox + your own mailbox; nothing is stored
 * by anyone else. Graph-only features are shown as gated ("needs UF IT").
 *
 * Ugly is fine here; SESSION A4 builds the designed pane (this is the working
 * reference it folds in).
 */
import { useState, type CSSProperties } from "react";
import { getOpenMessage, type OpenMessage } from "./office/context";
import { insertReply } from "./office/reply";
import { labelOpenItem } from "./office/categories";
import { createFreeDraftDeps } from "./draft/freeDeps";
import { runDraft, type DraftResult } from "./draft/pipeline";
import { toDraftProfile } from "./draft/profileAdapter";
import type { RelationshipCard } from "./draft/wrap";
import { getNavKey, setNavKey, KeyValidationError } from "./llm/key";
import { parseEml } from "./intel/eml";
import { createFreeFitDeps } from "./intel/freeFitDeps";
import { fitVoice, type FitProgress } from "./intel/onboarding";
import { hashAddress } from "./intel/relationships";
import { createMemStore } from "./store/memStore";
import { ProfileV1, RelationshipsV1 } from "./store/schemas";

const box: CSSProperties = { border: "1px solid #d8d8d8", borderRadius: 8, padding: 12, marginBottom: 12 };
const btn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #0a5",
  background: "#0a5",
  color: "white",
  cursor: "pointer",
};
const gated: CSSProperties = { ...box, background: "#f6f6f7", color: "#777", borderStyle: "dashed" };

const LABELS = [
  { name: "Glean/To respond", color: "preset0" },
  { name: "Glean/FYI", color: "preset3" },
  { name: "Glean/Waiting", color: "preset6" },
  { name: "Glean/Meetings", color: "preset5" },
];

const GATED_FEATURES = [
  "Auto-learn your voice from your whole sent history (no manual upload)",
  "Inbox catch-up — auto-label new mail in the background",
  "A living project/relationship memory saved in OneDrive (across sessions)",
  "Calendar-linked meetings + Microsoft To-Do action items",
];

export default function FreeMode() {
  const [msg] = useState<OpenMessage | null>(() => getOpenMessage());
  const [hasKey, setHasKey] = useState<boolean>(() => getNavKey() !== null);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState("");

  // Session voice store — trained profile + relationship cards live here for
  // the life of the pane only (in memory, nothing persisted to any server).
  const [store] = useState(() => createMemStore());
  const [trained, setTrained] = useState<{ emails: number; clusters: string[] } | null>(null);
  const [trainProg, setTrainProg] = useState<FitProgress | null>(null);
  const [training, setTraining] = useState(false);

  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [verifier, setVerifier] = useState<DraftResult["verifier"] | null>(null);
  const [styleUsed, setStyleUsed] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const userFullName = Office?.context?.mailbox?.userProfile?.displayName ?? "";

  async function saveKey() {
    setKeyMsg("Validating…");
    try {
      const { count } = await setNavKey(keyInput.trim());
      setHasKey(true);
      setKeyInput("");
      setKeyMsg(`Connected to NaviGator (${count} models).`);
    } catch (e) {
      setKeyMsg(e instanceof KeyValidationError ? e.message : "Could not validate the key.");
    }
  }

  async function loadCard(email: string): Promise<RelationshipCard | null> {
    const rel = await store.read("relationships.json", RelationshipsV1).catch(() => null);
    if (!rel) return null;
    const hash = await hashAddress(email);
    return (rel.data.entries[hash] as RelationshipCard | undefined) ?? null;
  }

  async function handleTrain(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setTraining(true);
    setTrainProg(null);
    try {
      const texts = await Promise.all(Array.from(files).map((f) => f.text()));
      const messages = texts.map(parseEml).filter((m) => (m.body?.content ?? "").trim().length > 0);
      if (messages.length === 0) throw new Error("No readable emails found in those files.");
      const deps = createFreeFitDeps({ messages, store, userFullName });
      const profile = await fitVoice(deps, (p) => setTrainProg(p));
      setTrained({
        emails: messages.length,
        clusters: profile.style_clusters.map((c) => c.name),
      });
      setStatus(`Trained your voice on ${messages.length} email(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed");
    } finally {
      setTraining(false);
    }
  }

  async function handleDraft() {
    if (!msg) return;
    setError("");
    setVerifier(null);
    setStyleUsed("");
    setDraft("");
    setDrafting(true);
    try {
      const deps = createFreeDraftDeps({
        loadProfile: async () => {
          const stored = await store.read("profile.json", ProfileV1).catch(() => null);
          if (!stored) return null;
          const card = await loadCard(msg.senderEmail);
          return toDraftProfile(stored.data, await hashAddress(msg.senderEmail), card);
        },
        loadCard,
      });
      const result = await runDraft({ message: msg }, deps, (delta) => setDraft((d) => d + delta));
      setDraft(result.text);
      setVerifier(result.verifier);
      setStyleUsed(result.styleUsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  function handleInsert() {
    setError("");
    try {
      insertReply(draft);
      setStatus("Draft inserted into the reply — review it and click Send in Outlook.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Insert failed");
    }
  }

  async function handleLabel(name: string) {
    setError("");
    try {
      await labelOpenItem(name);
      setStatus(`Labeled "${name}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Label failed");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", fontSize: 14, color: "#222" }}>
      <h2 style={{ marginTop: 0 }}>Local Glean</h2>
      <p style={{ color: "#0a5", fontSize: 12, marginTop: -8 }}>
        Private · on-device · no sign-in needed
      </p>

      {!hasKey && (
        <div style={box}>
          <strong>Connect NaviGator (one-time, this session)</strong>
          <p style={{ color: "#555" }}>
            Paste your UF NaviGator API key. It stays in this session only — never stored or logged.
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="NaviGator API key"
            style={{ width: "70%", padding: 6 }}
          />{" "}
          <button type="button" style={btn} onClick={saveKey} disabled={!keyInput.trim()}>
            Connect
          </button>
          {keyMsg && <p style={{ color: "#555" }}>{keyMsg}</p>}
        </div>
      )}

      <div style={box}>
        <strong>This email</strong>
        {msg ? (
          <ul style={{ margin: "6px 0" }}>
            <li>Subject: {msg.subject}</li>
            <li>From: {msg.senderName} &lt;{msg.senderEmail}&gt;</li>
          </ul>
        ) : (
          <p style={{ color: "#777" }}>Open an email in Outlook to begin.</p>
        )}
      </div>

      <div style={box}>
        <strong>Train my voice (optional)</strong>
        <p style={{ color: "#555", fontSize: 13 }}>
          Upload some of your own sent emails (.eml) — Glean learns your style on this device and
          never uploads them anywhere. Without this, drafts use a neutral professional voice.
        </p>
        <input
          type="file"
          accept=".eml,message/rfc822"
          multiple
          disabled={training}
          onChange={(e) => handleTrain(e.target.files)}
        />
        {training && trainProg && (
          <p style={{ color: "#555" }}>
            {trainProg.stage}… {trainProg.done}/{trainProg.total}
          </p>
        )}
        {trained && (
          <p style={{ color: "#0a5", fontSize: 13 }}>
            ✓ Trained on {trained.emails} email(s).
            {trained.clusters.length > 0 && <> Styles: {trained.clusters.join(", ")}.</>}
          </p>
        )}
      </div>

      <div style={box}>
        <strong>Reply in your voice</strong>
        <p>
          <button
            type="button"
            style={{ ...btn, opacity: !msg || !hasKey || drafting ? 0.5 : 1 }}
            onClick={handleDraft}
            disabled={!msg || !hasKey || drafting}
          >
            {drafting ? "Drafting…" : "Draft reply in my voice"}
          </button>
          {styleUsed && <span style={{ color: "#777", marginLeft: 8 }}>style: {styleUsed}</span>}
        </p>
        {draft && (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              style={{ width: "100%", padding: 8, fontFamily: "inherit", fontSize: 13 }}
            />
            {verifier && !verifier.passed && (
              <div style={{ color: "#b00020", fontSize: 12, marginTop: 4 }}>
                ⚠ Verifier flagged this draft — review before sending:
                <ul>{verifier.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            <p>
              <button type="button" style={btn} onClick={handleInsert} disabled={!msg}>
                Insert into reply
              </button>
            </p>
          </>
        )}
      </div>

      <div style={box}>
        <strong>Label this email</strong>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {LABELS.map((l) => (
            <button
              key={l.name}
              type="button"
              style={{ ...btn, background: "#345", border: "1px solid #345" }}
              onClick={() => handleLabel(l.name)}
              disabled={!msg}
            >
              {l.name.replace("Glean/", "")}
            </button>
          ))}
        </div>
      </div>

      <div style={gated}>
        <strong>🔒 Full features — need UF IT approval</strong>
        <p style={{ fontSize: 13, margin: "6px 0" }}>
          These need Microsoft Graph, which UF unlocks with one admin approval. Disabled until then:
        </p>
        <ul style={{ fontSize: 13, margin: 0 }}>
          {GATED_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      {status && <p style={{ color: "#0a5" }}>{status}</p>}
      {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
    </div>
  );
}
