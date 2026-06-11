import { graph as defaultGraph, type GraphFn } from "./client";

export interface GraphMessage {
	id: string;
	subject: string;
	from?: { emailAddress: { name?: string; address?: string } };
	toRecipients?: { emailAddress: { name?: string; address?: string } }[];
	receivedDateTime?: string;
	sentDateTime?: string;
	conversationId?: string;
	body?: { contentType: string; content: string };
	categories?: string[];
}

const SELECT = "id,subject,from,toRecipients,receivedDateTime,body,categories";

// Bridges Office.js → Graph: the open item's internetMessageId is the only
// stable cross-API key for the message.
export async function getMessageByInternetId(
	internetMessageId: string,
	graphFn: GraphFn = defaultGraph,
): Promise<GraphMessage | null> {
	const odataQuoted = internetMessageId.replace(/'/g, "''");
	const filter = encodeURIComponent(`internetMessageId eq '${odataQuoted}'`);
	const select = encodeURIComponent(SELECT);
	const res = await graphFn<{ value: GraphMessage[] }>(
		"GET",
		`/me/messages?%24filter=${filter}&%24select=${select}`,
	);
	return res.value[0] ?? null;
}

// Tag-strip for ANALYSIS text only — rendering safety is DOMPurify's job
// (custody rule OVERVIEW §2.4); this is never used to produce HTML.
export function htmlToText(html: string): string {
	if (!html) return "";
	const doc = new DOMParser().parseFromString(html, "text/html");
	for (const el of doc.querySelectorAll("script,style")) el.remove();
	return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
