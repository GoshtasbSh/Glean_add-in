/**
 * Adaptive-K selection — port of backend/src/glean/voice/style_clusters.py
 * select_k (silhouette + min-cluster-size floor + parsimony delta +
 * minimum-silhouette gate). Sparse users degrade to K=1 (global voice).
 *
 * Constants mirror style_clusters.py; the design doc (§MESO) caps K to [1,6]
 * which is exactly K_MAX.
 */
import { kmeansFit, silhouetteScore } from "./kmeans";

export const K_MAX = 6;
export const MIN_CLUSTER_SIZE = 15;
// 0.25 clears the measured k-means noise floor (~0.21 on isotropic gaussian
// noise); genuine register groups score >= 0.4. See style_clusters.py:28-32.
export const MIN_SILHOUETTE = 0.25;
export const SILHOUETTE_DELTA = 0.03;

export interface SelectKOpts {
  kMax?: number;
  minClusterSize?: number;
  minSilhouette?: number;
  delta?: number;
  seed?: number;
}

/** Calculated number of styles for this feature matrix. Returns >= 1. */
export function selectK(X: readonly (readonly number[])[], opts: SelectKOpts = {}): number {
  const {
    kMax = K_MAX,
    minClusterSize = MIN_CLUSTER_SIZE,
    minSilhouette = MIN_SILHOUETTE,
    delta = SILHOUETTE_DELTA,
    seed = 0,
  } = opts;
  const n = X.length;
  if (n < 2 * minClusterSize) return 1;
  // Cap at n-1 so silhouette is never computed with k == n (style_clusters.py:54).
  const upper = Math.min(kMax, Math.floor(n / minClusterSize), n - 1);
  if (upper < 2) return 1;
  let bestK = 1;
  let bestSil = -1.0;
  for (let k = 2; k <= upper; k++) {
    const { labels } = kmeansFit(X, k, { nInit: 10, seed });
    const counts = new Array<number>(k).fill(0);
    for (const l of labels) counts[l]++;
    if (Math.min(...counts) < minClusterSize) continue; // data does not support k real styles
    const sil = silhouetteScore(X, labels);
    if (sil >= minSilhouette && sil > bestSil + delta) {
      bestK = k;
      bestSil = sil;
    }
  }
  return bestK;
}
