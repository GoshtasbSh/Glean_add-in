/**
 * Stylometric feature extraction — port of backend/src/glean/voice/style_features.py
 * + the pieces of glean/voice/extractor.py it depends on (regexes, formality_score).
 *
 * Function-by-function, same tokenization, same counts, same order. Parity is
 * asserted against tests/fixtures/oracle/features.json to 1e-9 per dimension.
 *
 * Known JS/Python regex deltas (irrelevant on the ASCII parity corpus, noted
 * for honesty): Python `\w` is unicode-aware; JS `\w` is ASCII. Where Python
 * uses `\w` we use `[\p{L}\p{N}_]` with the /u flag to stay unicode-equivalent.
 */

export const FEATURE_NAMES = [
  "formality", // 0..1 (extractor heuristic)
  "log_word_count", // length
  "avg_sentence_len",
  "contraction_rate",
  "question_rate",
  "exclamation_rate",
  "has_greeting",
  "has_signoff",
  "symbol_rate", // emoji/non-ascii/symbol density
] as const;

// extractor.py:107-114 — anchored greeting (Python re.match == JS ^ without /m)
const GREETING_RE = /^\s*(Good morning|Good afternoon|Hello|Dear|Hi|Hey)\b/i;
const SIGNOFF_RE =
  /\b(Best regards|Warm regards|Kind regards|Best|Thank you|Thanks|Cheers|Regards|Sincerely)\b/i;
const CONTRACTION_RE = /\b[\p{L}\p{N}_]+'(t|s|re|ve|ll|d|m)\b/giu;
const TOKEN_RE = /[a-z][a-z']+/g;
// style_features.py:34-35
const SENT_SPLIT = /[.!?]+/;
const EMOJI_SYMBOL = /[^\p{L}\p{N}_\s.,;:'"!?()-]/gu;

const FORMAL_GREETING: Record<string, number> = {
  dear: 1.0,
  "good morning": 0.9,
  "good afternoon": 0.9,
  hello: 0.6,
  hi: 0.5,
  hey: 0.0,
};
const FORMAL_SIGNOFF: Record<string, number> = {
  sincerely: 1.0,
  regards: 0.9,
  "kind regards": 0.95,
  "best regards": 0.9,
  "warm regards": 0.85,
  "thank you": 0.7,
  best: 0.5,
  thanks: 0.5,
  cheers: 0.1,
};

function countMatches(re: RegExp, text: string): number {
  // Fresh lastIndex for global regexes shared across calls.
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}

/**
 * Python round(x, 3): correctly-rounded to 3 decimals, ties (exact .0005 in the
 * double) go to even. Math.round alone rounds half away from zero and would
 * drift on exact-half values like 0.6875.
 */
function pythonRound3(x: number): number {
  const scaled = x * 1000;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r: number;
  if (diff > 0.5) r = floor + 1;
  else if (diff < 0.5) r = floor;
  else r = floor % 2 === 0 ? floor : floor + 1;
  return r / 1000;
}

/** extractor.py:187-210 — heuristic 0 (casual) .. 1 (formal). */
export function formalityScore(text: string): number {
  const t = text ?? "";
  const components: number[] = [];

  const gm = GREETING_RE.exec(t.slice(0, 80));
  if (gm) components.push(FORMAL_GREETING[gm[1].toLowerCase()] ?? 0.5);

  const sm = SIGNOFF_RE.exec(t.slice(-120));
  if (sm) components.push(FORMAL_SIGNOFF[sm[1].toLowerCase()] ?? 0.5);

  const words = t.toLowerCase().match(TOKEN_RE) ?? [];
  if (words.length > 0) {
    const ratio = countMatches(CONTRACTION_RE, t) / words.length;
    components.push(1.0 - Math.min(ratio * 8, 1.0));
  }

  const sentences = t.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 0 && words.length > 0) {
    const avgLen = words.length / sentences.length;
    components.push(Math.max(0.0, Math.min((avgLen - 8) / 20, 1.0)));
  }

  if (components.length === 0) return 0.5;
  return pythonRound3(components.reduce((a, b) => a + b, 0) / components.length);
}

/** style_features.py:38-56 — 9-dim vector, same order as FEATURE_NAMES. */
export function styleFeatureVector(text: string): number[] {
  const t = text ?? "";
  const words = t.toLowerCase().match(TOKEN_RE) ?? [];
  const nWords = words.length;
  const sentences = t.split(SENT_SPLIT).filter((s) => s.trim().length > 0);
  const nSent = Math.max(1, sentences.length);
  const chars = Math.max(1, t.length);

  return [
    formalityScore(t),
    Math.log1p(nWords),
    nWords / nSent,
    nWords > 0 ? countMatches(CONTRACTION_RE, t) / nWords : 0.0,
    countMatches(/\?/g, t) / nSent,
    countMatches(/!/g, t) / nSent,
    GREETING_RE.test(t.slice(0, 80)) ? 1.0 : 0.0,
    SIGNOFF_RE.test(t.slice(-120)) ? 1.0 : 0.0,
    countMatches(EMOJI_SYMBOL, t) / chars,
  ];
}
