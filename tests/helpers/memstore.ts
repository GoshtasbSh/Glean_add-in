/**
 * In-memory Store double for onboarding/catch-up tests. Mimics the OneDrive
 * store contract: schema-validating read/write, etag bump per write,
 * ConflictError on stale etag.
 */
import type { z } from "zod";
import { ConflictError, type Store } from "../../src/store/onedrive";

export interface MemStore extends Store {
	files: Map<string, { json: string; etag: string }>;
	writes: string[]; // chronological write paths (ordering assertions)
}

export function createMemStore(): MemStore {
	const files = new Map<string, { json: string; etag: string }>();
	const writes: string[] = [];
	let etagCounter = 0;

	return {
		files,
		writes,
		async read<S extends z.ZodType>(path: string, schema: S) {
			const f = files.get(path);
			if (!f) return null;
			return {
				data: schema.parse(JSON.parse(f.json)) as z.infer<S>,
				etag: f.etag,
			};
		},
		async write<S extends z.ZodType>(
			path: string,
			schema: S,
			data: z.infer<S>,
			etag?: string,
		) {
			schema.parse(data);
			const existing = files.get(path);
			if (etag !== undefined && existing && existing.etag !== etag) {
				throw new ConflictError(path);
			}
			etagCounter += 1;
			const newTag = `"e${etagCounter}"`;
			files.set(path, { json: JSON.stringify(data), etag: newTag });
			writes.push(path);
			return { etag: newTag };
		},
		async list(folder: string) {
			const prefix = `${folder}/`;
			return [...files.keys()]
				.filter((k) => k.startsWith(prefix))
				.map((k) => ({ name: k.slice(prefix.length) }));
		},
		async ensureFolder() {},
		async del(path: string) {
			files.delete(path);
		},
	};
}
