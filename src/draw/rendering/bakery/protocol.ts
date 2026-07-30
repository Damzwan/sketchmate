import type { BakeryResponse } from "@/draw/rendering/bakery/bakery.types";

export interface PendingBake {
	resolve: (response: BakeryResponse | null) => void;
	timer: ReturnType<typeof setTimeout>;
}

export const PER_OBJECT_TIMEOUT_MS = 6;

export function requestTimeoutMs(
	baseTimeoutMs: number,
	objectCount: number,
	queuedRequests: number,
): number {
	return (
		(baseTimeoutMs + PER_OBJECT_TIMEOUT_MS * objectCount) * (1 + queuedRequests)
	);
}
