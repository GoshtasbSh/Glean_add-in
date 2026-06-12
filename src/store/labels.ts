/**
 * The user's label set — what the add-in classifies open emails into. Starts
 * from a Fyxer-style default taxonomy and is fully user-editable; the chosen set
 * is saved in the user's OWN mailbox (roaming settings) so it persists per user.
 *
 * NOTE: applying a label needs a matching Outlook category to exist (the FREE
 * permission can't create categories — that's the post-UFIT/admin path). So a
 * label only "lands" once the user has an Outlook category of the same name.
 */
import { roamingGet, roamingSave, roamingSet } from "./roaming";

export interface UserLabel {
	/** Outlook category name + display name. */
	name: string;
	/** One-line definition shown to the classifier. */
	desc: string;
}

// Fyxer-style action set (the common buckets), as a sensible starting point.
export const DEFAULT_LABELS: UserLabel[] = [
	{ name: "To respond", desc: "needs a reply or an action from me; asks me a question; I owe a response" },
	{ name: "FYI", desc: "informational — no response expected from me" },
	{ name: "Awaiting reply", desc: "I already replied; I'm waiting on the other person" },
	{ name: "Meeting", desc: "a meeting invite, scheduling, agenda, or calendar update" },
	{ name: "Notification", desc: "an automated alert, receipt, or system/app notification" },
	{ name: "Marketing", desc: "a newsletter, promotion, or marketing email" },
	{ name: "Comment", desc: "a discussion thread I'm part of but don't need to drive" },
	{ name: "Actioned", desc: "already handled — keep for the record" },
];

const LABELS_KEY = "glean.labels.v1";
const MAX_LABELS = 30;

function isLabel(x: unknown): x is UserLabel {
	if (x === null || typeof x !== "object") return false;
	const l = x as Record<string, unknown>;
	return (
		typeof l.name === "string" &&
		l.name.trim().length > 0 &&
		typeof l.desc === "string"
	);
}

/** The user's saved label set, or the defaults when none/invalid is stored. */
export function getLabels(): UserLabel[] {
	const raw = roamingGet<unknown>(LABELS_KEY);
	if (Array.isArray(raw) && raw.length > 0 && raw.every(isLabel)) {
		return raw as UserLabel[];
	}
	return DEFAULT_LABELS;
}

/** Persist the user's label set to their mailbox (deduped by name, capped). */
export async function saveLabels(labels: UserLabel[]): Promise<void> {
	const seen = new Set<string>();
	const clean = labels
		.filter(isLabel)
		.map((l) => ({ name: l.name.trim(), desc: l.desc.trim() }))
		.filter((l) => {
			const key = l.name.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, MAX_LABELS);
	roamingSet(LABELS_KEY, clean);
	await roamingSave();
}
