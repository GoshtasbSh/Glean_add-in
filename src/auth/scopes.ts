// Delegated Graph scopes — OVERVIEW §2.7. Mail.Send is deliberately absent:
// the add-in never sends mail.
export const GRAPH_SCOPES: string[] = [
	"User.Read",
	"Mail.Read",
	"Mail.ReadWrite",
	"MailboxSettings.ReadWrite",
	"Files.ReadWrite.AppFolder",
	"Tasks.ReadWrite",
	"Calendars.Read",
	"offline_access",
];
