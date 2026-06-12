/**
 * Free-mode FitDeps — drives A3's `fitVoice` from UPLOADED mail (.eml) instead
 * of Microsoft Graph: the same onboarding engine, no bulk-mail read, no Graph.
 *   - listSent  ← the parsed uploaded corpus (held in memory)
 *   - embed/chat ← NaviGator (user's own key)
 *   - store     ← in-memory (session) store; nothing persisted to OneDrive
 *
 * This is the second half of the seam, mirroring draft/freeDeps.ts. Swapping to
 * the Graph-backed FitDeps (listSent over /me/mailFolders/sentitems) needs no
 * change to fitVoice once UFIT enables Graph.
 */
import type { FitDeps } from "./onboarding";
import type { GraphMessage } from "../graph/mail";
import type { Store } from "../store/onedrive";
import { chat as navChat, embed as navEmbed } from "../llm/navigator";
import { DRAFT_MODEL } from "../llm/models";

export interface FreeFitConfig {
  messages: GraphMessage[];
  store: Store;
  userFullName: string;
  embed?: (texts: string[], opts?: { abort?: AbortSignal }) => Promise<number[][]>;
  /** NaviGator-style chat (takes a model); wrapped to FitDeps.chat shape. */
  chat?: (opts: {
    model: string;
    system: string;
    user: string;
    abort?: AbortSignal;
  }) => Promise<string>;
  model?: string;
  now?: () => Date;
}

export function createFreeFitDeps(c: FreeFitConfig): FitDeps {
  const embed = c.embed ?? ((texts, opts) => navEmbed(texts, opts));
  const model = c.model ?? DRAFT_MODEL;
  const chatFn = c.chat ?? navChat;

  return {
    listSent: async (_since, opts) => {
      opts.onPage?.(c.messages.length);
      return c.messages.slice(0, opts.cap);
    },
    embed,
    chat: (opts) => chatFn({ model, system: opts.system, user: opts.user, abort: opts.abort }),
    store: c.store,
    userFullName: c.userFullName,
    now: c.now,
  };
}
