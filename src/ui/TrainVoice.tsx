/**
 * TrainVoice — FREE voice training (NO Microsoft Graph, NO UFIT). The user
 * uploads their own sent emails (.eml); they are parsed in-browser, run through
 * A3's fitVoice on UF NaviGator, and the resulting voice is used by the Draft
 * tab. A COMPACT copy is saved to the user's OWN mailbox (roaming settings) so
 * the voice survives Outlook restarts — train once, not every session. The .eml
 * files never leave the browser; nothing is stored on any developer server.
 *
 * This is the free counterpart to the Graph "auto-refit from your whole sent
 * history" (which stays gated). It closes the gap where voice was wrongly shown
 * as needing UFIT.
 */
import { useEffect, useState } from "react";
import { parseEml } from "../intel/eml";
import { createFreeFitDeps } from "../intel/freeFitDeps";
import { fitVoice, type FitProgress } from "../intel/onboarding";
import { getNavKey } from "../llm/key";
import { NeedsKeyError } from "../llm/navigator";
import {
  getVoiceStore,
  isVoiceTrained,
  persistVoiceToMailbox,
  resetVoiceStore,
  voiceClusterNames,
} from "../store/voiceSession";

interface TrainVoiceProps {
  /** Called after a successful train so the pane can reflect the new voice. */
  onTrained?: () => void;
}

export function TrainVoice({ onTrained }: TrainVoiceProps) {
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<FitProgress | null>(null);
  const [done, setDone] = useState<{ emails: number; clusters: string[] } | null>(null);
  const [error, setError] = useState("");
  const [remembered, setRemembered] = useState(false);

  // Reflect a voice trained in an earlier session (persisted in the mailbox).
  useEffect(() => {
    let live = true;
    isVoiceTrained()
      .then((t) => {
        if (live) setRemembered(t);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const userFullName =
    typeof Office !== "undefined"
      ? (Office.context?.mailbox?.userProfile?.displayName ?? "")
      : "";

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setDone(null);
    setProg(null);
    if (getNavKey() === null) {
      setError("Connect your NaviGator key (above) first.");
      return;
    }
    setBusy(true);
    try {
      const texts = await Promise.all(Array.from(files).map((f) => f.text()));
      const messages = texts.map(parseEml).filter((m) => (m.body?.content ?? "").trim().length > 0);
      if (messages.length === 0) throw new Error("No readable emails found in those files.");
      // Fresh upload = fresh training: drop any prior session store so a second
      // upload REPLACES the voice instead of resuming/merging the earlier corpus
      // via profile.partial.json (review finding).
      resetVoiceStore();
      const deps = createFreeFitDeps({ messages, store: getVoiceStore(), userFullName });
      await fitVoice(deps, (p) => setProg(p));
      // Remember the voice in the user's mailbox so they don't re-upload next time.
      await persistVoiceToMailbox().catch(() => undefined);
      setDone({ emails: messages.length, clusters: await voiceClusterNames() });
      setRemembered(true);
      onTrained?.();
    } catch (e) {
      if (e instanceof NeedsKeyError) setError("Connect your NaviGator key (above) first.");
      else setError(e instanceof Error ? e.message : "Training failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-group">
      <span className="micro-label">Voice (free — no approval needed)</span>
      <div className="settings-card">
        <div
          className="setting-row"
          style={{ cursor: "default", flexDirection: "column", alignItems: "flex-start", gap: 6 }}
        >
          <span className="setting-name">Train my voice from my emails</span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Upload some of your own sent emails (.eml). Glean learns your style on this device — the
            files never leave your browser. Drafts then sound like you.
          </span>
          <label
            className="validate-btn"
            style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Training…" : "Choose .eml files"}
            <input
              type="file"
              accept=".eml,message/rfc822"
              multiple
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          {busy && prog && (
            <p style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {prog.stage}… {prog.done}/{prog.total}
            </p>
          )}
          {done && (
            <p style={{ fontSize: 11, color: "var(--green)" }} role="status">
              ✓ Trained on {done.emails} email(s).
              {done.clusters.length > 0 && <> Styles: {done.clusters.join(", ")}.</>}
            </p>
          )}
          {remembered && !done && !busy && (
            <p style={{ fontSize: 11, color: "var(--green)" }} role="status">
              ✓ Your voice is remembered (saved in your mailbox) — drafts already sound like you.
              Upload more anytime to refine it.
            </p>
          )}
          {error && (
            <p style={{ fontSize: 11, color: "var(--amber)" }} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
