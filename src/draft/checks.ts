/**
 * Deterministic draft safety checks — port of backend/src/glean/draft/checks.py
 * + the design doc §1-MICRO belt-and-suspenders greeting/sign-off detector.
 *
 * Exact banned-phrase matching and greeting detection are regex jobs, not LLM
 * jobs: these gates can never silently regress with model drift and are
 * unit-testable offline. The LLM verifier is the primary semantic check.
 */

const CURLY: Record<string, string> = { "’": "'", "‘": "'", "ʼ": "'" };
const WS = /\s+/g;

/** checks.py _normalize: NFKC + curly->straight apostrophes + collapsed whitespace. */
function normalize(text: string): string {
  let t = text.normalize("NFKC");
  for (const [k, v] of Object.entries(CURLY)) t = t.split(k).join(v);
  return t.replace(WS, " ");
}

/** Banned phrases present in text (normalised, case-insensitive). */
export function findBannedPhrases(text: string, banned: readonly string[]): string[] {
  const low = normalize(text).toLowerCase();
  return banned.filter((p) => p && low.includes(normalize(p).toLowerCase()));
}

// Same anchored patterns the feature extractor uses (extractor.py:107-111).
const GREETING_RE = /^\s*(Good morning|Good afternoon|Hello|Dear|Hi|Hey)\b/i;
const SIGNOFF_RE =
  /\b(Best regards|Warm regards|Kind regards|Best|Thank you|Thanks|Cheers|Regards|Sincerely)\s*,\s*\n/i;

/**
 * Design doc §1-MICRO: the verifier "additionally rejects bodies that contain
 * a greeting/sign-off (belt + suspenders)". Deterministic layer of that rule:
 * a salutation in the first line or a sign-off line followed by a signature.
 */
export function findGreetingOrSignoffInBody(body: string): string[] {
  const reasons: string[] = [];
  if (GREETING_RE.test(body.slice(0, 80))) {
    reasons.push("greeting in body (must be body-only; greeting is assembled deterministically)");
  }
  if (SIGNOFF_RE.test(body.slice(-120))) {
    reasons.push("sign-off in body (must be body-only; sign-off is assembled deterministically)");
  }
  return reasons;
}
