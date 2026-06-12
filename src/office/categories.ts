/**
 * Outlook category labeling via Office.js — no Microsoft Graph, no token, no
 * admin consent. Outlook itself applies the category. The free-mode
 * counterpart to graph/categories.ts (used when Graph isn't available).
 */
export interface NativeCategory {
	displayName: string;
	color: string;
}

/** Resolve an Office.js async op that yields no value (add/apply). */
function voidPromise(
	run: (cb: (r: Office.AsyncResult<unknown>) => void) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		run((res) => {
			if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
			else reject(new Error("Office.js category operation failed"));
		});
	});
}

export function listMasterCategories(): Promise<NativeCategory[]> {
	return new Promise((resolve, reject) => {
		Office.context.mailbox.masterCategories.getAsync((res) => {
			if (res.status === Office.AsyncResultStatus.Succeeded) {
				resolve(
					(res.value ?? []).map((c) => ({
						displayName: c.displayName,
						color: String(c.color),
					})),
				);
			} else {
				reject(new Error("Failed to list master categories"));
			}
		});
	});
}

/**
 * Map a "preset0" config string to the runtime CategoryColor value. The enum
 * members are capitalized (Preset0..Preset24); passing the lowercase string is
 * rejected by Outlook, so resolve to the real enum member (falling back to the
 * capitalized string when the enum object isn't present, e.g. in tests).
 */
function resolveColor(color: string): Office.MailboxEnums.CategoryColor {
	const key = color.charAt(0).toUpperCase() + color.slice(1); // preset0 -> Preset0
	const colors =
		typeof Office !== "undefined"
			? (Office.MailboxEnums?.CategoryColor as unknown as
					| Record<string, Office.MailboxEnums.CategoryColor>
					| undefined)
			: undefined;
	return (colors?.[key] ?? key) as Office.MailboxEnums.CategoryColor;
}

/** Add the category to the mailbox master list if it isn't already there. */
export async function ensureMasterCategory(
	name: string,
	color: string,
): Promise<void> {
	const existing = await listMasterCategories();
	if (existing.some((c) => c.displayName.toLowerCase() === name.toLowerCase()))
		return;
	await voidPromise((cb) =>
		Office.context.mailbox.masterCategories.addAsync(
			[{ displayName: name, color: resolveColor(color) }],
			cb,
		),
	);
}

/** Apply an existing category to the currently open message. */
export function addCategoryToOpenItem(name: string): Promise<void> {
	return voidPromise((cb) =>
		Office.context.mailbox.item!.categories.addAsync([name], cb),
	);
}

/** Ensure the category exists in the master list, then apply it to the open item. */
export async function labelOpenItem(
	name: string,
	color: string,
): Promise<void> {
	await ensureMasterCategory(name, color);
	await addCategoryToOpenItem(name);
}
