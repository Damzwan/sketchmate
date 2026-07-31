import { yieldToMain } from "@/draw/scheduling/yielder";
import { recordPhase } from "@/draw/rendering/renderMetrics";

interface DraftThumbnailOptions {
	maxSize: number;
	quality: number;
	signal?: AbortSignal;
	bounds?: { x: number; y: number; w: number; h: number } | null;
}

export interface DraftSnapshotWorkerResult {
	blob: Blob | null;
	jsonBlob: Blob;
}

const WORKER_TIMEOUT_MS = 30_000;
const TRANSFER_BATCH_SIZE = 32;

export function supportsDraftThumbnailWorker(): boolean {
	return (
		typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"
	);
}

export function renderDraftThumbnailInWorker(
	json: any,
	options: DraftThumbnailOptions,
): Promise<Blob | null> {
	return renderDraftSnapshotInWorker(json, options).then(
		(result) => result?.blob ?? null,
	);
}

export function renderDraftSnapshotInWorker(
	json: any,
	options: DraftThumbnailOptions,
): Promise<DraftSnapshotWorkerResult | null> {
	const { signal } = options;
	if (!supportsDraftThumbnailWorker()) return Promise.resolve(null);

	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./preview.worker.ts", import.meta.url), {
			type: "module",
		});
		let settled = false;

		const finish = (
			result: DraftSnapshotWorkerResult | null,
			error?: unknown,
		) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
			worker.terminate();
			if (error) reject(error);
			else resolve(result);
		};
		const abort = () => finish(null, new DOMException("Aborted", "AbortError"));
		const timeout = setTimeout(
			() => finish(null, new Error("Preview worker timed out")),
			WORKER_TIMEOUT_MS,
		);

		worker.onmessage = ({ data }) => {
			if (data?.error) {
				finish(null, new Error(data.error));
				return;
			}
			finish(
				data?.jsonBlob instanceof Blob
					? {
							blob: data?.blob instanceof Blob ? data.blob : null,
							jsonBlob: data.jsonBlob,
						}
					: null,
			);
		};
		worker.onerror = (event) => {
			event.preventDefault();
			finish(null, new Error(event.message || "Preview worker failed"));
		};
		if (signal?.aborted) {
			abort();
			return;
		}
		signal?.addEventListener("abort", abort, { once: true });
		const sendSnapshot = async () => {
			worker.postMessage({
				type: "start",
				background: json?.background,
				document: { ...json, objects: undefined },
				maxSize: options.maxSize,
				quality: options.quality,
				bounds: options.bounds,
			});
			const objects = json?.objects ?? [];
			for (
				let index = 0;
				index < objects.length;
				index += TRANSFER_BATCH_SIZE
			) {
				if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
				const transferStartedAt = performance.now();
				worker.postMessage({
					type: "append",
					objects: objects.slice(index, index + TRANSFER_BATCH_SIZE),
				});
				recordPhase("thumbnailTransfer", performance.now() - transferStartedAt);
				if (index + TRANSFER_BATCH_SIZE < objects.length) {
					await yieldToMain("thumbnail-transfer");
				}
			}
			worker.postMessage({ type: "render" });
		};
		void sendSnapshot().catch((error) => finish(null, error));
	});
}
