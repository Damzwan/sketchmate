/**
 * Gzips a draft document off the main thread.
 *
 * `CompressionStream` does its deflate synchronously per chunk on whatever
 * thread pumps the stream. On the main thread that is a few hundred
 * milliseconds of CPU for a large drawing, sliced across tasks — invisible in a
 * profile as one long block, but very visible as dropped frames on a low-end
 * Android WebView. A Blob crosses to a worker by reference, so moving the whole
 * job here costs one postMessage and buys the entire main-thread budget back.
 */

interface GzipRequest {
	blob: Blob;
}

self.onmessage = async ({ data }: MessageEvent<GzipRequest>) => {
	try {
		const stream = data.blob
			.stream()
			.pipeThrough(new CompressionStream("gzip"));
		const blob = await new Response(stream).blob();
		self.postMessage({ blob });
	} catch (error) {
		self.postMessage({ error: String(error) });
	}
};
