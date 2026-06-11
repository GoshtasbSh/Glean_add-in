import { auth } from "../auth/msal";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_RETRIES = 3;

export class GraphError extends Error {
	// Message carries status + code only — response bodies may contain
	// FERPA-restricted content and must never leak into errors/logs.
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string) {
		super(`Graph request failed: ${status} ${code}`);
		this.name = "GraphError";
		this.status = status;
		this.code = code;
	}
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface GraphOpts {
	body?: unknown;
	headers?: Record<string, string>;
	raw?: boolean;
}

export type GraphFn = <T>(
	method: Method,
	path: string,
	opts?: GraphOpts,
) => Promise<T>;

interface ClientDeps {
	getToken: () => Promise<string>;
	fetchFn?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function errorCode(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { error?: { code?: string } };
		// Cap length: non-conforming endpoints (SharePoint download redirects)
		// can return oversized strings under `code`.
		return (body.error?.code ?? "").slice(0, 64);
	} catch {
		return "";
	}
}

export function createGraphClient(deps: ClientDeps): { graph: GraphFn } {
	const fetchFn = deps.fetchFn ?? fetch;
	const sleep = deps.sleep ?? realSleep;

	const graph: GraphFn = async <T>(
		method: Method,
		path: string,
		opts: GraphOpts = {},
	) => {
		let token = await deps.getToken();
		let retries = 0;
		let refreshed = false;

		// Loop is bounded: every branch either returns, throws, or increments
		// `retries` toward MAX_RETRIES (the 401 branch runs at most once).
		for (;;) {
			const headers: Record<string, string> = {
				Authorization: `Bearer ${token}`,
				...opts.headers,
			};
			const init: RequestInit = { method, headers };
			if (opts.body !== undefined) {
				headers["Content-Type"] = "application/json";
				init.body = JSON.stringify(opts.body);
			}

			let res: Response;
			try {
				res = await fetchFn(`${GRAPH_BASE}${path}`, init);
			} catch (networkErr) {
				// DNS/offline/TLS failures are as transient as a 503 — retry them.
				if (retries >= MAX_RETRIES) throw networkErr;
				retries += 1;
				await sleep(1000 * 2 ** (retries - 1));
				continue;
			}

			if (res.status === 429 || res.status === 503) {
				if (retries >= MAX_RETRIES)
					throw new GraphError(res.status, await errorCode(res));
				const retryAfter = Number(res.headers.get("Retry-After"));
				// Retry-After may be 0, negative, or an HTTP-date (NaN) — fall back
				// to exponential backoff for anything that isn't a positive number.
				const delayMs =
					Number.isFinite(retryAfter) && retryAfter > 0
						? retryAfter * 1000
						: 1000 * 2 ** retries;
				retries += 1;
				await sleep(delayMs);
				continue;
			}

			if (res.status === 401 && !refreshed) {
				refreshed = true;
				token = await deps.getToken();
				continue;
			}

			if (!res.ok) throw new GraphError(res.status, await errorCode(res));

			if (opts.raw) return res as unknown as T;
			if (res.status === 204) return undefined as T;
			return (await res.json()) as T;
		}
	};

	return { graph };
}

// App-wide client bound to the MSAL singleton; tests build their own.
export const { graph } = createGraphClient({ getToken: () => auth.getToken() });
