/**
 * Parity: TS k-means / adaptive-K / silhouette vs the oracle
 * (glean/voice/style_clusters.py).
 *
 * DoD split (oracle/README.md): scaler + silhouette-given-assignments +
 * prediction-with-oracle-centroids are EXACT (1e-9); a fresh fit must choose
 * the same K and reach silhouette >= oracle's - 0.02 (fit randomness is the
 * documented exception).
 */
import { describe, expect, it } from "vitest";
import { selectK } from "../../src/intel/adaptiveK";
import { styleFeatureVector } from "../../src/intel/features";
import {
	fitStandardScaler,
	kmeansFit,
	kmeansPredict,
	silhouetteScore,
	transformStandard,
} from "../../src/intel/kmeans";
import clustersJson from "../fixtures/oracle/clusters.json";
import corpusJson from "../fixtures/oracle/corpus.json";

interface OracleClusters {
	params: {
		k_max: number;
		min_cluster_size: number;
		min_silhouette: number;
		silhouette_delta: number;
	};
	scaler_mean: number[];
	scaler_scale: number[];
	chosen_k: number;
	assignments: Record<string, number>;
	centroids_scaled: number[][];
	centroids_original: number[][];
	silhouette: number | null;
	silhouette_direct: number | null;
}

const oracle = clustersJson as OracleClusters;
const corpus = (corpusJson as { emails: { id: string; text: string }[] })
	.emails;

const raw = corpus.map((e) => styleFeatureVector(e.text));
const ids = corpus.map((e) => e.id);
const oracleLabels = ids.map((id) => oracle.assignments[id]);

describe("standard scaler parity", () => {
	it("mean and scale match the oracle to 1e-9", () => {
		const scaler = fitStandardScaler(raw);
		for (let d = 0; d < scaler.mean.length; d++) {
			expect(
				Math.abs(scaler.mean[d] - oracle.scaler_mean[d]),
				`mean dim ${d}`,
			).toBeLessThanOrEqual(1e-9);
			expect(
				Math.abs(scaler.scale[d] - oracle.scaler_scale[d]),
				`scale dim ${d}`,
			).toBeLessThanOrEqual(1e-9);
		}
	});
});

describe("prediction with oracle centroids (exact)", () => {
	it("assigns every email to the oracle cluster", () => {
		const X = transformStandard(raw, {
			mean: oracle.scaler_mean,
			scale: oracle.scaler_scale,
		});
		const pred = kmeansPredict(X, oracle.centroids_scaled);
		expect(pred).toEqual(oracleLabels);
	});
});

describe("silhouette given oracle assignments", () => {
	it("matches the direct-formula Python silhouette to 1e-9", () => {
		if (oracle.silhouette_direct === null)
			throw new Error("oracle has no silhouette_direct");
		const X = transformStandard(raw, {
			mean: oracle.scaler_mean,
			scale: oracle.scaler_scale,
		});
		const sil = silhouetteScore(X, oracleLabels);
		expect(Math.abs(sil - oracle.silhouette_direct)).toBeLessThanOrEqual(1e-9);
	});

	it("matches sklearn silhouette_score within the documented 1e-7 band", () => {
		// sklearn's BLAS distance expansion carries ~4e-8 cancellation error on
		// near-identical points (oracle/README.md deviations) — not bit-reproducible.
		if (oracle.silhouette === null) throw new Error("oracle has no silhouette");
		const X = transformStandard(raw, {
			mean: oracle.scaler_mean,
			scale: oracle.scaler_scale,
		});
		const sil = silhouetteScore(X, oracleLabels);
		expect(Math.abs(sil - oracle.silhouette)).toBeLessThanOrEqual(1e-7);
	});
});

describe("fresh fit (quality band, documented exception)", () => {
	it("selectK chooses the oracle K and the fit reaches silhouette >= oracle - 0.02", () => {
		// Floor uses silhouette_direct: it is the value the TS silhouetteScore
		// is defined against (the sklearn value carries ~4e-8 BLAS noise).
		if (oracle.silhouette_direct === null)
			throw new Error("oracle has no silhouette_direct");
		const X = transformStandard(raw, {
			mean: oracle.scaler_mean,
			scale: oracle.scaler_scale,
		});
		const k = selectK(X, {
			kMax: oracle.params.k_max,
			minClusterSize: oracle.params.min_cluster_size,
			minSilhouette: oracle.params.min_silhouette,
			delta: oracle.params.silhouette_delta,
			seed: 0,
		});
		expect(k).toBe(oracle.chosen_k);

		const fit = kmeansFit(X, k, { nInit: 10, seed: 0 });
		const sil = silhouetteScore(X, fit.labels);
		expect(sil).toBeGreaterThanOrEqual(oracle.silhouette_direct - 0.02);
	});

	it("selectK degrades to 1 on sparse data (n < 2*minClusterSize)", () => {
		const X = transformStandard(
			raw.slice(0, 20),
			fitStandardScaler(raw.slice(0, 20)),
		);
		expect(selectK(X, { minClusterSize: 15, seed: 0 })).toBe(1);
	});

	it("kmeansFit on identical points never emits NaN/Infinity centroids (double-steal guard)", () => {
		const identical = Array.from({ length: 6 }, () => [1, 2, 3]);
		const fit = kmeansFit(identical, 3, { nInit: 3, seed: 0 });
		for (const c of fit.centroids) {
			for (const v of c) expect(Number.isFinite(v)).toBe(true);
		}
		expect(fit.labels).toHaveLength(6);
	});

	// ORACLE SANITY only (no TS kmeans code under test here): confirms
	// centroids_original really is the group mean of the raw corpus, so the
	// fixture itself can't drift. TS fit quality is covered by the test above.
	it("oracle sanity: centroids_original is the group mean of the raw corpus", () => {
		for (let c = 0; c < oracle.chosen_k; c++) {
			const members = raw.filter((_, i) => oracleLabels[i] === c);
			const dim = members[0].length;
			for (let d = 0; d < dim; d++) {
				const mean = members.reduce((a, m) => a + m[d], 0) / members.length;
				expect(
					Math.abs(mean - oracle.centroids_original[c][d]),
					`cluster ${c} dim ${d}`,
				).toBeLessThanOrEqual(1e-9);
			}
		}
	});
});
