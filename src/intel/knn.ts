/**
 * kNN stage-1 classifier — port of the decision logic in
 * backend/src/glean/classify/knn.py (lines 77-97), with cosine ranking in
 * place of the pgvector query (`1 - cosine_distance` == cosine similarity).
 *
 * Returns null when the neighbourhood isn't both close and in agreement —
 * those cases fall through to the LLM classifier (parity with Stage 2).
 */
import { cosine } from "./vectors";

export interface NeighborRow {
	label: string;
	sim: number;
}

export interface KnnDecision {
	label: string;
	confidence: number;
	source: "knn";
}

export interface KnnOpts {
	k?: number;
	threshold?: number;
	minAgreement?: number;
	margin?: number;
	minNeighbors?: number;
}

const DEFAULTS: Required<KnnOpts> = {
	k: 3,
	threshold: 0.66,
	minAgreement: 0.66,
	margin: 0.06,
	minNeighbors: 3,
};

/** Mirror of knn.py:77-97 — gates: minNeighbors, agreement, threshold, margin. */
export function knnDecide(
	rows: readonly NeighborRow[],
	opts: KnnOpts = {},
): KnnDecision | null {
	const o = { ...DEFAULTS, ...opts };
	if (rows.length < o.minNeighbors) return null;

	const counts = new Map<string, number>();
	const bestSim = new Map<string, number>();
	for (const { label, sim } of rows) {
		counts.set(label, (counts.get(label) ?? 0) + 1);
		bestSim.set(label, Math.max(bestSim.get(label) ?? 0, sim));
	}

	// Python max(counts, key=(count, bestSim)): first maximal key in insertion
	// order wins ties — Map preserves insertion order, strict > keeps the first.
	let majority: string | null = null;
	for (const label of counts.keys()) {
		if (
			majority === null ||
			(counts.get(label) ?? 0) > (counts.get(majority) ?? 0) ||
			((counts.get(label) ?? 0) === (counts.get(majority) ?? 0) &&
				(bestSim.get(label) ?? 0) > (bestSim.get(majority) ?? 0))
		) {
			majority = label;
		}
	}
	if (majority === null) return null;

	const share = (counts.get(majority) ?? 0) / rows.length;
	let runnerUp = 0;
	for (const [label, sim] of bestSim) {
		if (label !== majority && sim > runnerUp) runnerUp = sim;
	}
	const best = bestSim.get(majority) ?? 0;

	if (
		share >= o.minAgreement &&
		best >= o.threshold &&
		best - runnerUp >= o.margin
	) {
		return { label: majority, confidence: best, source: "knn" };
	}
	return null;
}

export interface KnnItem {
	id: string;
	label: string;
	vec: readonly number[];
}

export interface KnnResult {
	ranking: { id: string; label: string; sim: number }[];
	topK: { id: string; label: string; sim: number }[];
	decision: KnnDecision | null;
}

export function knnClassify(
	queryVec: readonly number[],
	items: readonly KnnItem[],
	opts: KnnOpts = {},
): KnnResult {
	const o = { ...DEFAULTS, ...opts };
	const ranking = items
		.map((it) => ({
			id: it.id,
			label: it.label,
			sim: cosine(queryVec, it.vec),
		}))
		.sort((a, b) => b.sim - a.sim); // stable: ties keep input order (Python parity)
	const topK = ranking.slice(0, o.k);
	return { ranking, topK, decision: knnDecide(topK, o) };
}
