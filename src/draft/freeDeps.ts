/**
 * Free-mode DraftDeps — wires the existing draft pipeline (runDraft) to
 * Office.js + NaviGator, with NO Microsoft Graph:
 *   - message body  ← the OPEN item (Office.js)
 *   - profile       ← roamingSettings (compact) or null (cold start)
 *   - relationship  ← null (cold start greeting/closing)
 *   - AI            ← NaviGator (user's own key)
 *   - thread/project/feedback ← omitted (need bulk mail / OneDrive = Graph)
 *
 * This is the swappable half of the seam. The Graph-backed deps (graph/mail +
 * store/onedrive) drop in unchanged once UFIT enables Graph — the pipeline
 * never changes.
 */

import type { GraphMessage } from "../graph/mail";
import { DRAFT_MODEL } from "../llm/models";
import {
	type ChatOpts,
	chat as navChat,
	chatStream as navChatStream,
} from "../llm/navigator";
import { getOpenMessageAsGraph } from "../office/mailItem";
import { loadFreeProfile } from "../store/roaming";
import type { DraftDeps, DraftProfile, StreamOpts } from "./pipeline";

export interface FreeDepsCollaborators {
	fetchOpenMessage?: () => Promise<GraphMessage | null>;
	loadProfile?: () => Promise<DraftProfile | null>;
	chat?: (opts: ChatOpts) => Promise<string>;
	chatStream?: (opts: ChatOpts) => AsyncGenerator<string>;
	/** Drafting model id; defaults to DRAFT_MODEL. */
	model?: string;
}

export function createFreeDraftDeps(c: FreeDepsCollaborators = {}): DraftDeps {
	const fetchOpenMessage = c.fetchOpenMessage ?? getOpenMessageAsGraph;
	const loadProfile = c.loadProfile ?? loadFreeProfile;
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
		loadCard: async () => null,
		chatStream: (opts) => chatStream(toChatOpts(opts)),
		chat: (opts) => chat(toChatOpts(opts)),
		// Free mode has no persistent feedback queue (A3 catch-up that consumes it
		// needs Graph). The pipeline still calls this — accept and discard.
		appendFeedback: async () => {},
	};
}
