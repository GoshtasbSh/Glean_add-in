import { type DependencyList, useEffect, useState } from "react";

export type AsyncState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "done"; data: T }
	| { status: "error"; message: string };

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
	const [state, setState] = useState<AsyncState<T>>({ status: "idle" });
	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setState({ status: "loading" });
		fn().then(
			(data) => {
				if (!cancelled) setState({ status: "done", data });
			},
			(err: unknown) => {
				if (!cancelled)
					setState({
						status: "error",
						message: err instanceof Error ? err.message : String(err),
					});
			},
		);
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
	return state;
}
