import type { z } from "zod";
import { graph as defaultGraph, GraphError, type GraphFn } from "../graph/client";

// All paths are relative to the app folder (Graph: /me/drive/special/approot).
// First write auto-creates the folder; the user sees it under Apps/<app name>.
const APPROOT = "/me/drive/special/approot";

export class ConflictError extends Error {
  constructor(path: string) {
    super(`Write conflict on ${path} — file changed since it was read`);
    this.name = "ConflictError";
  }
}

export interface Store {
  read<S extends z.ZodType>(
    path: string,
    schema: S
  ): Promise<{ data: z.infer<S>; etag: string } | null>;
  write<S extends z.ZodType>(
    path: string,
    schema: S,
    data: z.infer<S>,
    etag?: string
  ): Promise<{ etag: string }>;
  list(folder: string): Promise<{ name: string }[]>;
  ensureFolder(path: string): Promise<void>;
  del(path: string): Promise<void>;
}

// Later sessions build paths from project slugs/event ids — never let a
// crafted segment escape the approot scope.
function assertSafePath(path: string): void {
  if (path.includes("..") || path.startsWith("/")) {
    throw new Error(`Unsafe store path: ${path}`);
  }
}

export function createStore(graphFn: GraphFn = defaultGraph): Store {
  return {
    async read(path, schema) {
      assertSafePath(path);
      let meta: { eTag: string };
      try {
        meta = await graphFn<{ eTag: string }>("GET", `${APPROOT}:/${path}`);
      } catch (e) {
        if (e instanceof GraphError && e.status === 404) return null;
        throw e;
      }
      // Known TOCTOU: another client may write between the metadata and
      // content GETs, leaving a stale etag with fresh data. Harmless — the
      // next write with that etag 412s into ConflictError (accepted, plan §3.7).
      const res = await graphFn<Response>("GET", `${APPROOT}:/${path}:/content`, { raw: true });
      const data = schema.parse(await res.json());
      return { data, etag: meta.eTag };
    },

    async write(path, schema, data, etag) {
      assertSafePath(path);
      schema.parse(data); // validate before anything leaves the client
      try {
        const item = await graphFn<{ eTag: string }>("PUT", `${APPROOT}:/${path}:/content`, {
          body: data,
          headers: etag ? { "If-Match": etag } : undefined,
        });
        return { etag: item.eTag };
      } catch (e) {
        if (e instanceof GraphError && e.status === 412) throw new ConflictError(path);
        throw e;
      }
    },

    async list(folder) {
      assertSafePath(folder);
      const res = await graphFn<{ value: { name: string }[] }>(
        "GET",
        `${APPROOT}:/${folder}:/children`
      );
      return res.value;
    },

    async ensureFolder(path) {
      assertSafePath(path);
      try {
        await graphFn("POST", `${APPROOT}/children`, {
          body: { name: path, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
        });
      } catch (e) {
        if (e instanceof GraphError && e.status === 409) return; // already exists
        throw e;
      }
    },

    async del(path) {
      assertSafePath(path);
      await graphFn("DELETE", `${APPROOT}:/${path}`);
    },
  };
}

export const store = createStore();
