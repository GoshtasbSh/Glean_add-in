/**
 * StandardScaler + k-means + silhouette — port of the numerics used by
 * backend/src/glean/voice/style_clusters.py (sklearn KMeans / silhouette_score
 * / StandardScaler).
 *
 * Parity contract (oracle/README.md):
 * - scaler mean/scale, silhouette-given-assignments, prediction-with-given-
 *   centroids: EXACT to 1e-9 vs sklearn.
 * - fresh fits use kmeans++ with an injectable seeded RNG; sklearn's RNG is
 *   not reproducible here, so fit parity is quality-band only (same chosen K,
 *   silhouette within 0.02). Do not chase exact fit parity.
 */

export interface StandardScaler {
	mean: number[];
	scale: number[];
}

/** Population statistics (ddof=0), zero-variance dims get scale 1 (sklearn rule). */
export function fitStandardScaler(
	X: readonly (readonly number[])[],
): StandardScaler {
	const n = X.length;
	if (n === 0) throw new Error("fitStandardScaler: empty matrix");
	const dim = X[0].length;
	const mean = new Array<number>(dim).fill(0);
	for (const row of X) for (let d = 0; d < dim; d++) mean[d] += row[d];
	for (let d = 0; d < dim; d++) mean[d] /= n;
	const scale = new Array<number>(dim).fill(0);
	for (const row of X) {
		for (let d = 0; d < dim; d++) {
			const diff = row[d] - mean[d];
			scale[d] += diff * diff;
		}
	}
	for (let d = 0; d < dim; d++) {
		scale[d] = Math.sqrt(scale[d] / n);
		if (scale[d] === 0) scale[d] = 1;
	}
	return { mean, scale };
}

export function transformStandard(
	X: readonly (readonly number[])[],
	scaler: StandardScaler,
): number[][] {
	return X.map((row) =>
		row.map((v, d) => (v - scaler.mean[d]) / scaler.scale[d]),
	);
}

function sqDist(a: readonly number[], b: readonly number[]): number {
	let s = 0;
	for (let d = 0; d < a.length; d++) {
		const diff = a[d] - b[d];
		s += diff * diff;
	}
	return s;
}

/** Nearest centroid by squared euclidean; ties go to the lowest index (argmin). */
export function kmeansPredict(
	X: readonly (readonly number[])[],
	centroids: readonly (readonly number[])[],
): number[] {
	return X.map((row) => {
		let best = 0;
		let bestD = sqDist(row, centroids[0]);
		for (let c = 1; c < centroids.length; c++) {
			const d = sqDist(row, centroids[c]);
			if (d < bestD) {
				best = c;
				bestD = d;
			}
		}
		return best;
	});
}

/**
 * Silhouette score with TRUE euclidean distances, same formula as sklearn:
 * per sample, a = mean intra-cluster distance (excluding self), b = min over
 * other clusters of mean distance; s = (b-a)/max(a,b); singletons score 0;
 * returns the mean over all samples.
 *
 * Parity note: sklearn computes distances via the ||x||^2+||y||^2-2x.y
 * expansion through BLAS, which carries up to ~4e-8 cancellation error on
 * near-identical points and is not bit-reproducible outside numpy. This
 * implementation matches the oracle's `silhouette_direct` to 1e-9 and the
 * sklearn `silhouette` value to a documented 1e-7 band.
 */
export function silhouetteScore(
	X: readonly (readonly number[])[],
	labels: readonly number[],
): number {
	const n = X.length;
	const clusters = new Map<number, number[]>();
	labels.forEach((l, i) => {
		const arr = clusters.get(l) ?? [];
		arr.push(i);
		clusters.set(l, arr);
	});
	if (clusters.size < 2 || clusters.size >= n) {
		throw new Error(
			`silhouetteScore: needs 2 <= k < n (k=${clusters.size}, n=${n})`,
		);
	}
	let total = 0;
	for (let i = 0; i < n; i++) {
		const own = clusters.get(labels[i]);
		if (!own) throw new Error("unreachable: label without cluster");
		if (own.length === 1) continue; // s(i) = 0 for singletons
		let a = 0;
		for (const j of own) if (j !== i) a += Math.sqrt(sqDist(X[i], X[j]));
		a /= own.length - 1;
		let b = Number.POSITIVE_INFINITY;
		for (const [label, members] of clusters) {
			if (label === labels[i]) continue;
			let s = 0;
			for (const j of members) s += Math.sqrt(sqDist(X[i], X[j]));
			b = Math.min(b, s / members.length);
		}
		// Coincident points: a = b = 0 -> sklearn's nan_to_num convention is 0.
		const maxAB = Math.max(a, b);
		total += maxAB === 0 ? 0 : (b - a) / maxAB;
	}
	return total / n;
}

/** Deterministic RNG (mulberry32) so fits are reproducible per seed. */
export function makeRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface KmeansFitResult {
	centroids: number[][];
	labels: number[];
	inertia: number;
}

interface KmeansFitOpts {
	nInit?: number;
	seed?: number;
	maxIter?: number;
}

function kmeansPlusPlusInit(
	X: readonly (readonly number[])[],
	k: number,
	rng: () => number,
): number[][] {
	const centroids: number[][] = [[...X[Math.floor(rng() * X.length)]]];
	const d2 = X.map((row) => sqDist(row, centroids[0]));
	while (centroids.length < k) {
		const sum = d2.reduce((a, b) => a + b, 0);
		let pick = X.length - 1;
		if (sum > 0) {
			let r = rng() * sum;
			for (let i = 0; i < X.length; i++) {
				r -= d2[i];
				if (r <= 0) {
					pick = i;
					break;
				}
			}
		} else {
			pick = Math.floor(rng() * X.length);
		}
		const c = [...X[pick]];
		centroids.push(c);
		for (let i = 0; i < X.length; i++) d2[i] = Math.min(d2[i], sqDist(X[i], c));
	}
	return centroids;
}

function lloyd(
	X: readonly (readonly number[])[],
	init: number[][],
	maxIter: number,
): KmeansFitResult {
	const k = init.length;
	const dim = X[0].length;
	let centroids = init.map((c) => [...c]);
	let labels = kmeansPredict(X, centroids);
	for (let iter = 0; iter < maxIter; iter++) {
		const sums = Array.from({ length: k }, () =>
			new Array<number>(dim).fill(0),
		);
		const counts = new Array<number>(k).fill(0);
		for (let i = 0; i < X.length; i++) {
			counts[labels[i]]++;
			for (let d = 0; d < dim; d++) sums[labels[i]][d] += X[i][d];
		}
		// Empty cluster: re-seed it on the point farthest from its centroid.
		// `stolen` prevents two empty clusters stealing the SAME point in one
		// pass, which would zero a count again and divide a centroid by 0.
		const stolen = new Set<number>();
		for (let c = 0; c < k; c++) {
			if (counts[c] === 0) {
				let far = -1;
				let farD = -1;
				for (let i = 0; i < X.length; i++) {
					if (stolen.has(i) || counts[labels[i]] <= 1) continue;
					const d = sqDist(X[i], centroids[labels[i]]);
					if (d > farD) {
						farD = d;
						far = i;
					}
				}
				if (far === -1) break; // degenerate: no donor cluster has >1 member
				stolen.add(far);
				sums[c] = [...X[far]];
				counts[c] = 1;
				const old = labels[far];
				counts[old]--;
				for (let d = 0; d < dim; d++) sums[old][d] -= X[far][d];
				labels[far] = c;
			}
		}
		// A cluster can stay empty only in the degenerate break above; guard the
		// division so a restart never emits NaN/Infinity centroids.
		for (let c = 0; c < k; c++) if (counts[c] === 0) counts[c] = 1;
		centroids = sums.map((s, c) => s.map((v) => v / counts[c]));
		const next = kmeansPredict(X, centroids);
		let changed = false;
		for (let i = 0; i < X.length; i++) {
			if (next[i] !== labels[i]) {
				changed = true;
				break;
			}
		}
		labels = next;
		if (!changed) break;
	}
	let inertia = 0;
	for (let i = 0; i < X.length; i++)
		inertia += sqDist(X[i], centroids[labels[i]]);
	return { centroids, labels, inertia };
}

/** kmeans++ x nInit restarts, best inertia wins (sklearn KMeans semantics). */
export function kmeansFit(
	X: readonly (readonly number[])[],
	k: number,
	opts: KmeansFitOpts = {},
): KmeansFitResult {
	const { nInit = 10, seed = 0, maxIter = 300 } = opts;
	if (X.length < k) throw new Error(`kmeansFit: n=${X.length} < k=${k}`);
	const rng = makeRng(seed);
	let best: KmeansFitResult | null = null;
	for (let run = 0; run < nInit; run++) {
		const result = lloyd(X, kmeansPlusPlusInit(X, k, rng), maxIter);
		if (best === null || result.inertia < best.inertia) best = result;
	}
	if (best === null) throw new Error("unreachable: nInit >= 1");
	return best;
}
