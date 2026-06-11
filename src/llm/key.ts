/**
 * NaviGator API key accessor — THE ONLY module allowed to touch the key
 * (design doc §5, custody hard rule §2.2).
 *
 * - Backed by sessionStorage ONLY (cleared on pane close); never localStorage,
 *   never any persisted file, never React state serialization.
 * - setNavKey validates LIVE via GET /v1/models before storing.
 * - The key must never appear in logs, error messages, or URLs. Errors thrown
 *   here are constructed from status codes only.
 * - clearNavKey() is called on sign-out (AuthProvider) and may be called by UI.
 */

export const NAV_KEY_STORAGE_KEY = "glean.navigator.key";

export const NAVIGATOR_BASE_URL: string =
  (import.meta.env?.VITE_NAVIGATOR_BASE_URL as string | undefined) ?? "https://api.ai.it.ufl.edu/v1";

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
export async function setNavKey(key: string): Promise<{ count: number; modelIds: string[] }> {
  let resp: Response;
  try {
    resp = await fetch(`${NAVIGATOR_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    // Swallow the original error: fetch errors can embed request info.
    throw new KeyValidationError("NaviGator is unreachable — check your network and try again.");
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
  return { count: modelIds.length, modelIds };
}

export function getNavKey(): string | null {
  return sessionStorage.getItem(NAV_KEY_STORAGE_KEY);
}

export function clearNavKey(): void {
  sessionStorage.removeItem(NAV_KEY_STORAGE_KEY);
}
