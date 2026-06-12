/**
 * NaviGator API key accessor — THE ONLY module allowed to touch the key
 * (design doc §5).
 *
 * Storage (user-approved 2026-06-12 — supersedes the original sessionStorage-only
 * rule so the key survives Outlook restarts):
 * - In-session: sessionStorage (fast path).
 * - Persistent: the user's OWN UF mailbox via Office.js roaming settings — never
 *   localStorage, never any developer-controlled server. "Sign out / clear key"
 *   removes it from both.
 * - setNavKey validates LIVE via GET /v1/models before storing.
 * - The key must never appear in logs, error messages, or URLs. Errors thrown
 *   here are constructed from status codes only.
 */

export const NAV_KEY_STORAGE_KEY = "glean.navigator.key";

// The roaming-settings key (same name) lives only in the user's own mailbox,
// synced by Exchange across their devices. No Graph, no token, no server.
function roamingSettings(): Office.RoamingSettings | null {
	return typeof Office !== "undefined" && Office.context?.roamingSettings
		? Office.context.roamingSettings
		: null;
}

function saveRoaming(rs: Office.RoamingSettings): Promise<void> {
	return new Promise((resolve, reject) => {
		rs.saveAsync((res) => {
			if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
			else reject(new Error("Failed to save roaming settings"));
		});
	});
}

const _rawUrl: string =
	(import.meta.env?.VITE_NAVIGATOR_BASE_URL as string | undefined) ??
	"https://api.ai.it.ufl.edu/v1";

// Hard-fail at module load if env var points to a non-UF origin — prevents key exfiltration.
const _allowedOrigin = "https://api.ai.it.ufl.edu";
const _origin = new URL(_rawUrl).origin; // throws if _rawUrl is not a valid URL
if (_origin !== _allowedOrigin) {
	throw new Error(
		`VITE_NAVIGATOR_BASE_URL origin "${_origin}" is not allowed. Expected "${_allowedOrigin}".`,
	);
}

export const NAVIGATOR_BASE_URL: string = _rawUrl;

export class KeyValidationError extends Error {
	constructor(message: string) {
		super(message); // NEVER interpolate the key here
		this.name = "KeyValidationError";
	}
}

/**
 * Validate the key against the live /v1/models endpoint, then store it.
 * Returns the visible model ids (count shown in the UI; ids let the caller
 * confirm exact model strings WITHOUT making another authorized fetch —
 * this module must stay the only place that builds an Authorization header
 * from the key). Throws KeyValidationError without storing on any failure.
 */
export async function setNavKey(
	key: string,
): Promise<{ count: number; modelIds: string[] }> {
	let resp: Response;
	try {
		resp = await fetch(`${NAVIGATOR_BASE_URL}/models`, {
			headers: { Authorization: `Bearer ${key}` },
		});
	} catch {
		// Swallow the original error: fetch errors can embed request info.
		throw new KeyValidationError(
			"NaviGator is unreachable — check your network and try again.",
		);
	}
	if (!resp.ok) {
		throw new KeyValidationError(
			`NaviGator rejected the key (HTTP ${resp.status}). Check the key and try again.`,
		);
	}
	let modelIds: string[];
	try {
		const body = (await resp.json()) as { data?: { id?: unknown }[] };
		modelIds = Array.isArray(body.data)
			? body.data.map((m) => String(m.id ?? "")).filter((id) => id.length > 0)
			: [];
	} catch {
		throw new KeyValidationError("NaviGator returned an unexpected response.");
	}
	sessionStorage.setItem(NAV_KEY_STORAGE_KEY, key);
	// Persist to the user's own mailbox so the key survives Outlook restarts.
	// Best-effort: the in-session copy already works if the mailbox save fails.
	const rs = roamingSettings();
	if (rs) {
		rs.set(NAV_KEY_STORAGE_KEY, key);
		try {
			await saveRoaming(rs);
		} catch {
			// non-fatal — sessionStorage copy is set
		}
	}
	return { count: modelIds.length, modelIds };
}

export function getNavKey(): string | null {
	const fromSession = sessionStorage.getItem(NAV_KEY_STORAGE_KEY);
	if (fromSession) return fromSession;
	// Fresh Outlook session: rehydrate from the user's mailbox.
	const rs = roamingSettings();
	if (rs) {
		const v = rs.get(NAV_KEY_STORAGE_KEY);
		if (typeof v === "string" && v.length > 0) return v;
	}
	return null;
}

export function clearNavKey(): void {
	sessionStorage.removeItem(NAV_KEY_STORAGE_KEY);
	const rs = roamingSettings();
	if (rs) {
		rs.remove(NAV_KEY_STORAGE_KEY);
		void saveRoaming(rs).catch(() => undefined);
	}
}
