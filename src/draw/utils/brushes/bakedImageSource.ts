/**
 * Make a CANVAS-backed `FabricImage` serializable without a synchronous encode
 * on the serializing frame.
 *
 * Fabric's `Image.toObject()` calls `getSrc()`, which checks
 * `element.toDataURL` first — so an image whose element is a canvas re-encodes
 * the ENTIRE canvas to a PNG data URL on every serialization. The eraser's
 * flattened clip image is exactly that, at up to ~4 MP, and it is serialized on
 * every draft save, every sync payload and every history snapshot. One encode
 * is an atomic, un-yieldable main-thread block of several hundred ms to
 * multiple seconds on mobile: the `documentSerializeObject` stalls in the ANR
 * reports.
 *
 * Two changes, no pixel or payload difference:
 *
 *   1. MEMOIZE. The baked canvas is immutable once created (each flatten builds
 *      a NEW union canvas), so its data URL can be computed at most once.
 *   2. WARM IT ASYNCHRONOUSLY. `toBlob` encodes off the main thread, so the
 *      encode is already done by the time anything serializes. The synchronous
 *      `toDataURL` remains as the fallback for a serialization that beats the
 *      warm-up — same output, just the old cost, and only ever once.
 */

const encoded = new WeakMap<object, string>();

function encodeSync(canvas: HTMLCanvasElement): string {
	return canvas.toDataURL("image/png");
}

/**
 * Attach a memoized `getSrc` to `image` and start warming the encode.
 *
 * @param image the fabric image wrapping `canvas`
 * @param canvas the baked, never-redrawn canvas element backing it
 */
export function cacheBakedImageSource(image: any, canvas: HTMLCanvasElement) {
	image.getSrc = () => bakedCanvasDataUrl(canvas);
	warmBakedCanvasEncode(canvas);
}

/**
 * The memoized PNG data URL of a baked, never-redrawn canvas.
 *
 * Same contract as `cacheBakedImageSource` for drawables that are not
 * `FabricImage` and so have no `getSrc` to intercept — the smudge patch is one.
 */
export function bakedCanvasDataUrl(canvas: HTMLCanvasElement): string {
	const cached = encoded.get(canvas);
	if (cached !== undefined) return cached;
	const src = encodeSync(canvas);
	encoded.set(canvas, src);
	return src;
}

/** Start encoding off the main thread so no frame has to pay for it later. */
export function warmBakedCanvasEncode(canvas: HTMLCanvasElement): void {
	// Failure is silent and harmless: the on-demand encode still covers it.
	if (encoded.has(canvas) || typeof canvas.toBlob !== "function") return;
	try {
		canvas.toBlob((blob) => {
			if (!blob || encoded.has(canvas)) return;
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result;
				if (typeof result === "string" && !encoded.has(canvas)) {
					encoded.set(canvas, result);
				}
			};
			reader.onerror = () => {
				/* on-demand encode covers it */
			};
			reader.readAsDataURL(blob);
		}, "image/png");
	} catch {
		/* on-demand encode covers it */
	}
}
