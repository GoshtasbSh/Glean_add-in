/**
 * Vector math for the in-browser intelligence port.
 *
 * cosine mirrors backend/scripts/export_parity_fixtures.py `cosine` (and
 * pgvector's `1 - cosine_distance`): zero-norm input returns 0, never NaN.
 */

/**
 * Neumaier compensated summation — matches CPython 3.12+ builtins.sum() on
 * floats, which the Python oracle uses. Naive accumulation differs in the
 * last ulp and flips ranking order on near-tie similarities.
 */
export function neumaierSum(values: readonly number[]): number {
  let s = 0;
  let c = 0;
  for (const v of values) {
    const t = s + v;
    if (Math.abs(s) >= Math.abs(v)) c += s - t + v;
    else c += v - t + s;
    s = t;
  }
  return s + c;
}

export function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`dot: length mismatch ${a.length} vs ${b.length}`);
  const products = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) products[i] = a[i] * b[i];
  return neumaierSum(products);
}

export function norm(a: readonly number[]): number {
  const squares = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) squares[i] = a[i] * a[i];
  return Math.sqrt(neumaierSum(squares));
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/** Indices of the k largest values, descending; ties keep original order (stable). */
export function argTopK(values: readonly number[], k: number): number[] {
  const idx = values.map((_, i) => i);
  idx.sort((i, j) => values[j] - values[i]);
  return idx.slice(0, k);
}
