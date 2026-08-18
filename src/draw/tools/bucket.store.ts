import type { Canvas } from "fabric";
import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import {
	bucketFill,
	releaseFillBuffer,
	shutdownBucketFillWorker,
} from "@/draw/tools/bucketFill";
import type { ToolService } from "@/draw/tools/tool.types";
import { readCanvasPixel } from "@/draw/utils/canvasPixelRead";
import { isMobile } from "@/helper/platform.helper";

interface Bucket extends ToolService {
	isFilling: Ref<boolean>;
}

export const useBucket = defineStore("bucket", (): Bucket => {
	let c: Canvas | undefined;
	let gestureStart = false;
	let fillInProgress = false;
	let sessionAbortController = new AbortController();
	const isFilling = ref(false);

	const events: FabricEvent[] = [
		{
			on: "mouse:up",
			handler: async (o: any) => {
				if (gestureStart && isMobile()) {
					gestureStart = false;
					return;
				}
				if (fillInProgress) return;
				if (!isMobile() && o.e.button !== 0) return;

				// MUST be the canvas's OWN retina scaling, not window.devicePixelRatio:
				// the backing store is sized from fabric's config.devicePixelRatio,
				// which is capped at MAX_RENDER_SCALE (renderQuality.config.ts). Using
				// the raw device ratio here would index getImageData past the sampled
				// pixel on any DPR-3 phone and pick the wrong fill colour.
				const dpr = c!.getRetinaScaling();

				const screenPoint = c!.getViewportPoint(o.e);
				const ctx = c!.getContext();
				const px = Math.round(screenPoint.x * dpr);
				const py = Math.round(screenPoint.y * dpr);
				// Through the shared 1x1 scratch, not off the live canvas: repeated
				// readbacks make Chromium drop the drawing surface to software for the
				// rest of the session. See readCanvasPixel.
				const [r, g, b, a] =
					readCanvasPixel(c!.getElement(), px, py) ??
					ctx.getImageData(px, py, 1, 1).data;

				const hex =
					"#" +
					((1 << 24) | (r << 16) | (g << 8) | b)
						.toString(16)
						.slice(1)
						.toUpperCase() +
					a.toString(16).toUpperCase().padStart(2, "0");

				const isBackground = hex === c!.backgroundColor;

				// ── World-space click for the fill algorithm ───────────────────────
				// Fabric: screenPx = worldCoord * zoom + pan
				//         worldCoord = (screenPx - pan) / zoom
				const vpt = c!.viewportTransform!;
				const zoom = c!.getZoom();
				const worldPoint = {
					x: (screenPoint.x - vpt[4]) / zoom,
					y: (screenPoint.y - vpt[5]) / zoom,
				};

				// ── Run fill ──────────────────────────────────────────────────────
				// Only surface the "Filling…" indicator if the fill is slow enough to
				// be worth it — short fills finish before the timer and never flash it.
				fillInProgress = true;
				const spinnerTimer = setTimeout(() => {
					isFilling.value = true;
				}, 220);
				try {
					const img = await bucketFill(
						c!,
						worldPoint,
						sessionAbortController.signal,
					);
					if (!img) return;

					if (isBackground) {
						// Insert behind the lowest intersecting object so the fill acts
						// as a background layer rather than painting on top of strokes.
						const { getVisibleObjects } = useDrawObjectManager();
						const visibleObjects = getVisibleObjects();
						const canvasObjects = c!.getObjects();

						const intersectingIds = new Set(
							visibleObjects
								.filter(
									(obj) => !obj.isBucketFill && img.intersectsWithObject(obj),
								)
								.map((obj) => obj.id),
						);

						// Single linear scan — stops at first hit (already in z-order)
						let lowestIndex = canvasObjects.length;
						for (let i = 0; i < canvasObjects.length; i++) {
							if (intersectingIds.has(canvasObjects[i].id)) {
								lowestIndex = i;
								break;
							}
						}

						img.insertedIndex = lowestIndex;
						c!.insertAt(lowestIndex, img);
					} else {
						c!.add(img);
					}
				} catch (error) {
					if (!(error instanceof DOMException && error.name === "AbortError")) {
						console.error("[BucketFill] fill failed", error);
					}
				} finally {
					clearTimeout(spinnerTimer);
					fillInProgress = false;
					isFilling.value = false;
				}
			},
		},
		{
			on: "gestureStart",
			handler: () => {
				gestureStart = true;
			},
		},
	];

	function init(canvas: Canvas) {
		sessionAbortController.abort();
		sessionAbortController = new AbortController();
		c = canvas;
	}

	function destroy() {
		sessionAbortController.abort();
		shutdownBucketFillWorker();
		// The buffer is up to 16.8 MB of GPU surface and is worthless outside a
		// drawing session.
		releaseFillBuffer();
		fillInProgress = false;
		isFilling.value = false;
		c = undefined;
	}

	async function select() {
		if (!c) return;
		c.isDrawingMode = false;
		c.selection = false;
		c.skipTargetFind = true;
	}

	return { select, init, destroy, events, isFilling };
});
