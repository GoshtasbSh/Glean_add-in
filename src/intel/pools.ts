/**
 * Draft-time profile wiring — SESSION A3 §3.6.
 *
 * buildExemplarPools: profile.json exemplars → the A2 ladder's T1/T2/T3 pools
 * (design doc §2): T1 = sent mail to THIS person (newest first), T2 = the
 * person's dominant cluster, T3 = register match. Within T2/T3 the order is a
 * recency sort with the SOFT formality-proximity tie-break ported from
 * commit 0290e7b (never overrides recipient match or recency buckets).
 *
 * voiceSynthesisLine: cluster params → the §4 prompt line
 * ("average sentence length ~X words, contractions: rare, …").
 */

import type { Exemplar, StyleCluster } from "../store/schemas";
import { FEATURE_NAMES } from "./features";
import type { ExemplarPools } from "./ladder";

// 0290e7b _LEVEL_TARGET — register level → target formality scalar.
const LEVEL_TARGET: Record<string, number> = {
	formal: 0.8,
	neutral: 0.5,
	casual: 0.2,
};

const FORMALITY_IDX = FEATURE_NAMES.indexOf("formality");

function bySoftProximity(register: string) {
	const target = LEVEL_TARGET[register] ?? 0.5;
	return (a: Exemplar, b: Exemplar): number => {
		// Primary: recency (day-bucketed so proximity can break same-day ties).
		const dayA = a.sentAt.slice(0, 10);
		const dayB = b.sentAt.slice(0, 10);
		if (dayA !== dayB) return dayA < dayB ? 1 : -1;
		const proxA = 1 - Math.abs((a.styleVector[FORMALITY_IDX] ?? 0.5) - target);
		const proxB = 1 - Math.abs((b.styleVector[FORMALITY_IDX] ?? 0.5) - target);
		return proxB - proxA;
	};
}

export function buildExemplarPools(
	exemplars: readonly Exemplar[],
	recipientHash: string,
	register: string,
	clusterHist: Record<string, number> | undefined,
): ExemplarPools {
	const t1 = exemplars
		.filter((e) => e.recipientHash === recipientHash)
		.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
	const t1Ids = new Set(t1.map((e) => e.sourceMsgId));

	let dominantCluster: number | null = null;
	if (clusterHist) {
		let bestCount = -1;
		for (const [cluster, count] of Object.entries(clusterHist)) {
			if (count > bestCount) {
				bestCount = count;
				dominantCluster = Number(cluster);
			}
		}
	}
	const t2 =
		dominantCluster === null
			? []
			: exemplars
					.filter(
						(e) => e.cluster === dominantCluster && !t1Ids.has(e.sourceMsgId),
					)
					.sort(bySoftProximity(register));
	const t2Ids = new Set(t2.map((e) => e.sourceMsgId));

	const t3 = exemplars
		.filter(
			(e) =>
				e.register === register &&
				!t1Ids.has(e.sourceMsgId) &&
				!t2Ids.has(e.sourceMsgId),
		)
		.sort(bySoftProximity(register));

	const toInput = (e: Exemplar) => ({ body: e.text });
	return { t1: t1.map(toInput), t2: t2.map(toInput), t3: t3.map(toInput) };
}

const rate = (v: number, low: number, high: number): string =>
	v < low ? "rare" : v < high ? "occasional" : "frequent";

/** Design doc §4 voice-synthesis prompt line; "" when params are absent. */
export function voiceSynthesisLine(cluster: StyleCluster): string {
	const p = cluster.params;
	if (p.avg_sentence_len === undefined) return "";
	const parts = [
		`average sentence length ~${Math.round(p.avg_sentence_len)} words`,
	];
	if (p.contraction_rate !== undefined) {
		parts.push(`contractions: ${rate(p.contraction_rate, 0.02, 0.06)}`);
	}
	if (p.politeness_rate !== undefined) {
		parts.push(`politeness markers: ${rate(p.politeness_rate, 0.005, 0.02)}`);
	}
	if (p.exclamation_rate !== undefined) {
		parts.push(`exclamations: ${rate(p.exclamation_rate, 0.05, 0.3)}`);
	}
	return parts.join(", ");
}
