/**
 * Read the OPEN message's body via Office.js — no Microsoft Graph, no token,
 * no consent. Outlook hands the add-in the open item directly. Shaped as a
 * `GraphMessage` so it plugs straight into the existing draft pipeline's
 * `DraftDeps.fetchMessage` — the free-mode counterpart to graph/mail.ts.
 */
import type { GraphMessage } from "../graph/mail";
import { getOpenMessage } from "./context";

/** Resolve the open item's HTML body. Rejects if no item or the read fails. */
export function getOpenMessageBody(): Promise<string> {
	return new Promise((resolve, reject) => {
		const item = Office?.context?.mailbox?.item as
			| {
					body?: {
						getAsync?: (
							c: string,
							cb: (r: Office.AsyncResult<string>) => void,
						) => void;
					};
			  }
			| null
			| undefined;
		const getAsync = item?.body?.getAsync;
		if (!getAsync) {
			reject(new Error("No open message body available"));
			return;
		}
		getAsync(Office.CoercionType.Html, (res) => {
			if (res.status === Office.AsyncResultStatus.Succeeded) resolve(res.value);
			else reject(new Error("Failed to read the open message body"));
		});
	});
}

/** The open item as a `GraphMessage` (body read via Office.js). Null if none. */
export async function getOpenMessageAsGraph(): Promise<GraphMessage | null> {
	const open = getOpenMessage();
	if (!open) return null;
	const content = await getOpenMessageBody();
	return {
		id: open.internetMessageId,
		subject: open.subject,
		from: {
			emailAddress: { name: open.senderName, address: open.senderEmail },
		},
		conversationId: open.conversationId,
		body: { contentType: "html", content },
	};
}
