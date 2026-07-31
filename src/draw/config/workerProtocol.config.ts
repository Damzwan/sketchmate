export type WorkerProtocolMode = "legacy" | "v2";

export const WORKER_PROTOCOL_QUERY_KEY = "workerProtocol";
export const WORKER_PROTOCOL_STORAGE_KEY = "draw_worker_protocol";

function parseMode(
	value: string | null | undefined,
): WorkerProtocolMode | null {
	if (value === "legacy" || value === "v1") return "legacy";
	if (value === "v2") return "v2";
	return null;
}

export function resolveWorkerProtocolMode(
	search: string,
	stored: string | null | undefined,
): WorkerProtocolMode {
	let query: string | null = null;
	try {
		query = new URLSearchParams(search).get(WORKER_PROTOCOL_QUERY_KEY);
	} catch {
		// Invalid experiment URLs must not prevent drawing.
	}
	return parseMode(query) ?? parseMode(stored) ?? "v2";
}

export function getWorkerProtocolMode(): WorkerProtocolMode {
	const search =
		typeof window !== "undefined" ? (window.location?.search ?? "") : "";
	let stored: string | null = null;
	try {
		stored =
			typeof localStorage === "undefined"
				? null
				: localStorage.getItem(WORKER_PROTOCOL_STORAGE_KEY);
	} catch {
		// Storage may be unavailable in a restricted WebView.
	}
	return resolveWorkerProtocolMode(search, stored);
}

export function setWorkerProtocolMode(mode: WorkerProtocolMode): boolean {
	try {
		if (typeof localStorage === "undefined") return false;
		localStorage.setItem(WORKER_PROTOCOL_STORAGE_KEY, mode);
		return true;
	} catch {
		return false;
	}
}
