/**
 * Free-mode DraftDeps — wires the existing draft pipeline (runDraft) to
 * Office.js + NaviGator, with NO Microsoft Graph:
 *   - message body  ← the OPEN item (Office.js)
 *   - profile/card  ← session-trained voice (optional) or roaming/cold-start
 *   - AI            ← NaviGator (user's own key)
 *   - thread/project/feedback ← omitted (need bulk mail / OneDrive = Graph)
 *
 * This is the swappable half of the seam. The Graph-backed deps (graph/mail +
 * store/onedrive) drop in unchanged once UFIT enables Graph — the pipeline
 * never changes.
 */
import type { DraftDeps, DraftProfile, StreamOpts } from "./pipeline";
import type { RelationshipCard } from "./wrap";
import type { GraphMessage } from "../graph/mail";
import { getOpenMessageAsGraph } from "../office/mailItem";
import { loadFreeProfile } from "../store/roaming";
import { chat as navChat, chatStream as navChatStream, type ChatOpts } from "../llm/navigator";
import { DRAFT_MODEL } from "../llm/models";

export interface FreeDepsCollaborators {
  fetchOpenMessage?: () => Promise<GraphMessage | null>;
  loadProfile?: () => Promise<DraftProfile | null>;
  /** Per-recipient card from the session-trained relationships; default null (cold start). */
  loadCard?: (recipientEmail: string) => Promise<RelationshipCard | null>;
  chat?: (opts: ChatOpts) => Promise<string>;
  chatStream?: (opts: ChatOpts) => AsyncGenerator<string>;
  /** Drafting model id; defaults to DRAFT_MODEL. */
  model?: string;
}

export function createFreeDraftDeps(c: FreeDepsCollaborators = {}): DraftDeps {
  const fetchOpenMessage = c.fetchOpenMessage ?? getOpenMessageAsGraph;
  const loadProfile = c.loadProfile ?? loadFreeProfile;
  const loadCard = c.loadCard ?? (async () => null);
  const chat = c.chat ?? navChat;
  const chatStream = c.chatStream ?? navChatStream;
  const model = c.model ?? DRAFT_MODEL;

  const toChatOpts = (opts: StreamOpts): ChatOpts => ({
    model: opts.model ?? model,
    system: opts.system,
    user: opts.user,
    abort: opts.abort,
  });

  return {
    fetchMessage: () => fetchOpenMessage(),
    loadProfile: () => loadProfile(),
    loadCard: (recipientEmail) => loadCard(recipientEmail),
    chatStream: (opts) => chatStream(toChatOpts(opts)),
    chat: (opts) => chat(toChatOpts(opts)),
    // Free mode has no persistent feedback queue (A3 catch-up that consumes it
    // needs Graph). The pipeline still calls this — accept and discard.
    appendFeedback: async () => {},
  };
}
