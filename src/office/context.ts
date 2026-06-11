export interface OpenMessage {
	subject: string;
	senderName: string;
	senderEmail: string;
	internetMessageId: string;
	conversationId: string;
}

export function getOpenMessage(): OpenMessage | null {
	try {
		const item = Office?.context?.mailbox?.item as
			| Office.MessageRead
			| null
			| undefined;
		if (!item) return null;
		return {
			subject: item.subject ?? "",
			senderName: item.sender?.displayName ?? "",
			senderEmail: item.sender?.emailAddress ?? "",
			internetMessageId:
				(item as { internetMessageId?: string }).internetMessageId ?? "",
			conversationId: item.conversationId ?? "",
		};
	} catch {
		return null;
	}
}
