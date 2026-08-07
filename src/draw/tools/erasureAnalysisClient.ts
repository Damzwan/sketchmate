import type { FabricObject } from "fabric";
import {
	objectMutationRevision,
	serializeOnce,
} from "@/draw/objects/objectSerialization";

let worker: Worker | null = null;

// Request/response correlation + failure paths. Without these, a worker crash
// (onerror fires, no message ever comes) left the promise pending forever,
// which wedged the eraser cleanup queue (`draining` never resets) for the rest
// of the session. All failure modes resolve(false) — never delete on
// uncertainty, never stall the queue.
const WORKER_TIMEOUT_MS = 10_000;
let reqSeq = 0;

export interface ErasureAnalysisResult {
	fullyErased: boolean;
	objectJSON: any;
	objectRevision: number;
}

const pending = new Map<
	number,
	{
		resolve: (result: ErasureAnalysisResult) => void;
		timer: ReturnType<typeof setTimeout>;
		objectJSON: any;
		objectRevision: number;
	}
>();

function settle(reqId: number, value: boolean) {
	const p = pending.get(reqId);
	if (!p) return; // timed out / already settled — ignore stale reply
	pending.delete(reqId);
	clearTimeout(p.timer);
	p.resolve({
		fullyErased: value,
		objectJSON: p.objectJSON,
		objectRevision: p.objectRevision,
	});
}

function handleMessage(e: MessageEvent) {
	const { reqId, fullyErased, error } = e.data;
	if (error) {
		console.error("Erasure Worker Error:", error);
		settle(reqId, false);
		return;
	}
	settle(reqId, fullyErased === true);
}

function handleError() {
	for (const [id] of pending) settle(id, false);
	worker?.terminate();
	worker = null;
}

function getWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL("../workers/eraser.worker.ts", import.meta.url), {
		type: "module",
	});
	worker.onmessage = handleMessage;
	worker.onerror = handleError;
	return worker;
}

/** Release the worker and every object snapshot retained by an in-flight check. */
export function shutdownErasureAnalysisWorker(): void {
	for (const [id] of pending) settle(id, false);
	worker?.terminate();
	worker = null;
}

export async function analyzeErasureInWorker(
	obj: FabricObject,
): Promise<ErasureAnalysisResult> {
	return new Promise((resolve) => {
		const reqId = ++reqSeq;
		const objectJSON = serializeOnce(obj);
		const objectRevision = objectMutationRevision(obj);
		const b = (obj as any).getBoundingRect();

		const timer = setTimeout(() => {
			// A timed-out analysis may still be consuming CPU and retaining its object
			// snapshot. Fail correlated work and recreate the worker lazily next time.
			handleError();
		}, WORKER_TIMEOUT_MS);
		pending.set(reqId, {
			resolve,
			timer,
			objectJSON,
			objectRevision,
		});

		try {
			getWorker().postMessage({
				reqId,
				object: objectJSON,
				width: b.width,
				height: b.height,
				multiplier: 0.5,
			});
		} catch {
			handleError();
		}
	});
}
