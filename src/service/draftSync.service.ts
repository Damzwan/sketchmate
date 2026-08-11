/**
 * Streaming gzip + upload helpers for cloud draft sync.
 *
 * Kept apart from the store so the byte-shuffling is testable without Pinia,
 * and so the store reads as policy (what to sync, when) rather than plumbing.
 */

/** Ceiling on a single gzip job. A stuck worker must not strand the queue. */
const GZIP_WORKER_TIMEOUT_MS = 60_000;

/**
 * Compress in a worker. A Blob crosses the boundary by reference, so the whole
 * job moves for the price of one postMessage — no copy of the document.
 *
 * One worker per job, terminated on completion, matching the draft-thumbnail
 * worker. A resident worker would hold a thread (and its heap) for the entire
 * session to serve a task that runs a handful of times an hour.
 */
function gzipInWorker(blob: Blob): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL("./draftGzip.worker.ts", import.meta.url),
			{ type: "module" },
		);
		let settled = false;
		const finish = (result: Blob | null, error?: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			worker.terminate();
			if (error || !result) reject(error ?? new Error("Gzip worker failed"));
			else resolve(result);
		};
		const timeout = setTimeout(
			() => finish(null, new Error("Gzip worker timed out")),
			GZIP_WORKER_TIMEOUT_MS,
		);

		worker.onmessage = ({ data }) => {
			if (data?.error) return finish(null, new Error(data.error));
			finish(data?.blob instanceof Blob ? data.blob : null);
		};
		worker.onerror = (event) => {
			event.preventDefault();
			finish(null, new Error(event.message || "Gzip worker failed"));
		};
		worker.postMessage({ blob });
	});
}

/**
 * Gzip a document Blob without ever holding it as a string.
 *
 * A ~10 MB drawing lands around 1 MB on the wire — the difference between a
 * sync that works on mobile data and one that does not. The deflate itself runs
 * in a worker (see {@link gzipInWorker}); the main thread only ever handles Blob
 * handles.
 *
 * Two fallbacks, in order: worker unavailable or failing → compress inline;
 * `CompressionStream` missing entirely → upload raw. The caller is told which
 * happened so the upload's encoding stays honest.
 */
export async function gzipBlob(
	blob: Blob,
): Promise<{ body: Blob; compressed: boolean }> {
	if (typeof CompressionStream !== "function") {
		return { body: blob, compressed: false };
	}

	if (typeof Worker !== "undefined") {
		try {
			return { body: await gzipInWorker(blob), compressed: true };
		} catch (error) {
			console.warn(
				"[draftSync] gzip worker failed, compressing inline:",
				error,
			);
		}
	}

	try {
		const stream = blob.stream().pipeThrough(new CompressionStream("gzip"));
		const body = await new Response(stream).blob();
		return { body, compressed: true };
	} catch (error) {
		console.warn("[draftSync] gzip failed, uploading uncompressed:", error);
		return { body: blob, compressed: false };
	}
}

/** Reverse of {@link gzipBlob} for a downloaded document. */
export async function fetchDocumentBlob(
	url: string,
	signal?: AbortSignal,
): Promise<Blob> {
	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Draft download failed with status ${response.status}`);
	}

	const isGzipped = url.endsWith(".gz") || url.endsWith(".gzip");
	if (
		!isGzipped ||
		typeof DecompressionStream !== "function" ||
		!response.body
	) {
		return response.blob();
	}

	// Some CDNs transparently decode `Content-Encoding: gzip`. These objects are
	// stored as gzip BYTES with `Content-Type: application/gzip`, so that does
	// not apply — but a stray double-decode would throw here rather than corrupt
	// the draft, and the raw body is still a valid fallback.
	try {
		const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
		return await new Response(stream).blob();
	} catch (error) {
		console.warn("[draftSync] gunzip failed, using raw body:", error);
		return new Response(await response.arrayBuffer()).blob();
	}
}

/**
 * A stored thumbnail in whatever shape it has, as an uploadable Blob.
 *
 *   • `Blob`   — already there, no work.
 *   • `data:…` — legacy base64, decoded by `fetch` rather than `atob` plus a
 *                per-character loop. That loop ran once per byte of base64 —
 *                around 100k synchronous main-thread iterations for a 640px
 *                WebP — for a job the platform does in native code.
 *   • anything else — a remote CDN url. NOT fetched: those bytes came from the
 *                cloud, so re-uploading them would be a pointless round trip.
 */
export async function toThumbnailBlob(
	thumbnail: Blob | string | undefined,
): Promise<Blob | null> {
	if (thumbnail instanceof Blob) return thumbnail;
	if (!thumbnail || !thumbnail.startsWith("data:")) return null;
	try {
		return await (await fetch(thumbnail)).blob();
	} catch (error) {
		console.warn("[draftSync] could not decode thumbnail:", error);
		return null;
	}
}

export async function putToPresignedUrl(
	url: string,
	body: Blob,
	contentType: string,
	signal?: AbortSignal,
): Promise<void> {
	const response = await fetch(url, {
		method: "PUT",
		body,
		headers: { "Content-Type": contentType },
		signal,
	});
	if (!response.ok) {
		throw new Error(`Upload failed with status ${response.status}`);
	}
}
