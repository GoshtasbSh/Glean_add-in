/**
 * Insert a drafted reply into Outlook's reply form via Office.js — no Graph.
 * The add-in NEVER sends: it only prefills the reply; the human clicks Send.
 * (Custody hard rule OVERVIEW §2.5.)
 */
function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain-text draft → minimal HTML (escaped, newlines → <br>). */
export function draftToHtml(text: string): string {
	return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

/** Open Outlook's reply form prefilled with the draft. The user sends it. */
export function insertReply(draftText: string): void {
	const item = Office?.context?.mailbox?.item as
		| { displayReplyForm?: (data: string | { htmlBody: string }) => void }
		| undefined;
	if (!item?.displayReplyForm)
		throw new Error("Reply is only available on an open message");
	item.displayReplyForm({ htmlBody: draftToHtml(draftText) });
}
