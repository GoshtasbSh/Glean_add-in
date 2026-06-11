/**
 * Deterministic fake embedder — TEST-ONLY (parity with the Python oracle).
 *
 * Spec: tests/fixtures/oracle/README.md. Must match
 * backend/scripts/export_parity_fixtures.py `fake_embed` bit-for-bit:
 * FNV-1a 32-bit over each token's UTF-8 bytes, hashing-trick accumulation
 * into 64 dims with a sign bit, then L2 normalisation.
 *
 * Never used in production — real embeddings come from NaviGator.
 */

import { norm } from "./vectors";

const FNV_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(bytes: Uint8Array): number {
	let h = FNV_BASIS;
	for (const b of bytes) {
		h ^= b;
		h = Math.imul(h, FNV_PRIME) >>> 0;
	}
	return h >>> 0;
}

const encoder = new TextEncoder();

export function fakeEmbed(text: string, dim = 64): number[] {
	const vec = new Array<number>(dim).fill(0);
	const tokens = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
	for (const tok of tokens) {
		const h = fnv1a32(encoder.encode(tok));
		const idx = h % dim;
		const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
		vec[idx] += sign;
	}
	const n = norm(vec);
	if (n > 0) for (let i = 0; i < dim; i++) vec[i] /= n;
	return vec;
}
