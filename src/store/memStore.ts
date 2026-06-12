/**
 * In-memory Store — the free-mode counterpart to the OneDrive store. Holds the
 * voice profile / relationships / partial state for ONE session in memory only;
 * nothing is persisted (custody-safe). Used to drive A3's `fitVoice` from
 * uploaded mail without Microsoft Graph. Same contract as store/onedrive.ts:
 * schema-validating read/write, etag bump per write, ConflictError on stale etag.
 */
import type { z } from "zod";
import { ConflictError, type Store } from "./onedrive";

export interface MemStore extends Store {
  files: Map<string, { json: string; etag: string }>;
}

export function createMemStore(): MemStore {
  const files = new Map<string, { json: string; etag: string }>();
  let etagCounter = 0;

  return {
    files,
    async read<S extends z.ZodType>(path: string, schema: S) {
      const f = files.get(path);
      if (!f) return null;
      return { data: schema.parse(JSON.parse(f.json)) as z.infer<S>, etag: f.etag };
    },
    async write<S extends z.ZodType>(path: string, schema: S, data: z.infer<S>, etag?: string) {
      schema.parse(data);
      const existing = files.get(path);
      if (etag !== undefined && existing && existing.etag !== etag) {
        throw new ConflictError(path);
      }
      etagCounter += 1;
      const newTag = `"e${etagCounter}"`;
      files.set(path, { json: JSON.stringify(data), etag: newTag });
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
