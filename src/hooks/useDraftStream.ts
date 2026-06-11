/**
 * Addin draft-stream hook — ported from web/hooks/useDraftStream.ts (SESSION A4).
 * Uses runDraft + onDelta callback (no SSE/API_BASE — addin has no server).
 */
import { useCallback, useRef, useState } from "react";
import { createFreeDraftDeps } from "../draft/freeDeps";
import {
	type DraftRequest,
	type DraftResult,
	runDraft,
} from "../draft/pipeline";
import type { OpenMessage } from "../office/context";

export type DraftStreamStatus = "idle" | "streaming" | "done" | "error";

export interface DraftStreamState {
	text: string;
	status: DraftStreamStatus;
	verifier: DraftResult["verifier"] | null;
	result: DraftResult | null;
	errorMessage: string | null;
}

export interface DraftStreamHandle extends DraftStreamState {
	run(opts?: {
		tweak?: DraftRequest["tweak"];
		styleOverride?: string;
	}): Promise<void>;
	reset(): void;
}

export function useDraftStream(message: OpenMessage | null): DraftStreamHandle {
	const [state, setState] = useState<DraftStreamState>({
		text: "",
		status: "idle",
		verifier: null,
		result: null,
		errorMessage: null,
	});
	const abortRef = useRef<AbortController | null>(null);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setState({
			text: "",
			status: "idle",
			verifier: null,
			result: null,
			errorMessage: null,
		});
	}, []);

	const run = useCallback(
		async (opts?: {
			tweak?: DraftRequest["tweak"];
			styleOverride?: string;
		}) => {
			if (!message) return;
			abortRef.current?.abort();
			const ctrl = new AbortController();
			abortRef.current = ctrl;

			setState({
				text: "",
				status: "streaming",
				verifier: null,
				result: null,
				errorMessage: null,
			});

			try {
				const deps = createFreeDraftDeps();
				const req: DraftRequest = {
					message,
					tweak: opts?.tweak,
					styleOverride: opts?.styleOverride,
				};
				const result = await runDraft(
					req,
					{ ...deps, abort: ctrl.signal },
					(delta) => {
						if (ctrl.signal.aborted) return;
						setState((s) => ({ ...s, text: s.text + delta }));
					},
				);
				if (ctrl.signal.aborted) return;
				setState({
					text: result.text,
					status: "done",
					verifier: result.verifier,
					result,
					errorMessage: null,
				});
			} catch (e) {
				if (ctrl.signal.aborted) return;
				setState((s) => ({
					...s,
					status: "error",
					errorMessage: e instanceof Error ? e.message : "Draft failed",
				}));
			}
		},
		[message],
	);

	return { ...state, run, reset };
}
