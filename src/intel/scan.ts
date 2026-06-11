/**
 * Paginated mailbox scan — SESSION A3 §3.2. Lists messages from a well-known
 * folder since a date, newest first, following @odata.nextLink verbatim.
 * Minimal $select + body; 429/503 backoff lives in graph/client (A1).
 * Bodies stay in memory only (custody rule OVERVIEW §2.1).
 */
import { graph as defaultGraph, type GraphFn } from "../graph/client";
import type { GraphMessage } from "../graph/mail";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// conversationId is required for sent-diff matching (design doc §3.3).
const SELECT =
	"id,subject,from,toRecipients,receivedDateTime,sentDateTime,conversationId,body,categories";

const PAGE_SIZE = 100;

export interface ScanOpts {
	/** Hard cap on messages returned (plan: onboarding caps at 1500). */
	cap?: number;
	abort?: AbortSignal;
	/** Called after each page with the running total fetched. */
	onPage?: (fetched: number) => void;
	graphFn?: GraphFn;
}

type Folder = "sentitems" | "inbox";

interface MessagePage {
	value: GraphMessage[];
	"@odata.nextLink"?: string;
}

async function listFolderSince(
	folder: Folder,
	sinceIso: string,
	opts: ScanOpts,
): Promise<GraphMessage[]> {
	const graphFn = opts.graphFn ?? defaultGraph;
	const cap = opts.cap ?? Number.POSITIVE_INFINITY;
	const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
	// ASCENDING: oldest first, so a watermark = "last processed dateTime" makes
	// an interrupted run resumable by re-listing since the watermark (§3.3).
	// Graph requires the $filter property to lead $orderby (InefficientFilter otherwise).
	const orderby = encodeURIComponent("receivedDateTime asc");
	let path: string | null =
		`/me/mailFolders/${folder}/messages?%24filter=${filter}&%24orderby=${orderby}` +
		`&%24select=${encodeURIComponent(SELECT)}&%24top=${PAGE_SIZE}`;

	const out: GraphMessage[] = [];
	while (path !== null && out.length < cap) {
		if (opts.abort?.aborted) throw new DOMException("Aborted", "AbortError");
		const page: MessagePage = await graphFn<MessagePage>("GET", path);
		out.push(...page.value);
		opts.onPage?.(out.length);
		const next = page["@odata.nextLink"];
		// nextLink is absolute and already carries the skiptoken — follow verbatim.
		path = next ? next.replace(GRAPH_BASE, "") : null;
	}
	return out.slice(0, cap === Number.POSITIVE_INFINITY ? out.length : cap);
}

export function listSentSince(
	sinceIso: string,
	opts: ScanOpts = {},
): Promise<GraphMessage[]> {
	return listFolderSince("sentitems", sinceIso, opts);
}

export function listInboxSince(
	sinceIso: string,
	opts: ScanOpts = {},
): Promise<GraphMessage[]> {
	return listFolderSince("inbox", sinceIso, opts);
}
