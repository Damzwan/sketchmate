import { type Canvas, FabricObject } from "fabric";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { compareRenderOrder } from "@/draw/layers/layerRegistry";
import type {
	FloodFillRequest,
	FloodFillResponse,
} from "@/draw/tools/bucketFill.worker";
import { usePen } from "@/draw/tools/pen.store";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import type { Rect } from "@/draw/utils/QuadTree";
import { useToast } from "@/service/toast.service";

type Point = { x: number; y: number };

// Spatial constants. Resolution adapts to the thinnest barrier so hairline
// strokes still render as solid, multi-pixel barriers (see buildSmartOffscreenCanvas).
const MAX_WORLD_DIM = 2500; // Largest workspace — thick strokes / big fills / no strokes
const MIN_WORLD_DIM = 600; // Smallest workspace — hairline strokes get max resolution
const RDP_TOLERANCE = 1.2; // Vector simplification tuning variable
const MAX_WORLD_AREA = 40_000_000; // Final sanity cap on the vector we build (see ESCALATION)
const MAX_OFFSCREEN_PIXELS = 1200; // Offscreen buffer edge (px) for the FIRST attempt

/**
 * ESCALATION — buffer sizes tried, in order, when a fill reaches the buffer
 * border.
 *
 * The edge-touch test is the only reliable "this fill is unbounded" signal, but
 * at a fixed buffer it cannot tell a genuinely LARGE CLOSED shape (a big circle)
 * from a leak into open space — both run off the edge. That is why filling a
 * large circle failed with "Area too large".
 *
 * The fix is to retry with a bigger BUFFER while holding `pxScale` CONSTANT.
 * Barrier legibility depends only on pxScale (a stroke must rasterize to
 * >= MIN_BARRIER_PX or the flood leaks through it), so keeping pxScale fixed and
 * growing the buffer buys proportionally more world coverage with IDENTICAL leak
 * behaviour — strictly more area, no accuracy trade. Only the transient
 * ImageData grows (4 bytes/px: 1200²≈5.8MB, 2048²≈16.8MB, 2600²≈27MB), and it
 * lives in the worker for the duration of one fill.
 *
 * A true empty-canvas flood still runs off the edge at every level and is
 * rejected at the last one — the original protection is intact, just no longer
 * trigger-happy on legitimate shapes. Mobile stops one level early on memory.
 */
const IS_MOBILE_FILL =
	typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);
const ESCALATION_BUFFERS = IS_MOBILE_FILL
	? [MAX_OFFSCREEN_PIXELS, 2048]
	: [MAX_OFFSCREEN_PIXELS, 2048, 2600];
const MIN_BARRIER_PX = 3; // Barrier must render >= this many px to block the radius-2 flood
const BASE_BLEED = 1.5; // Fill bleed (world units) tucked under surrounding strokes

// ── Flood-fill worker (lazy singleton) ──────────────────────────────────────
// The flood fill scan + contour tracing run off the main thread so big fills
// no longer freeze the UI. Concurrency is guarded by the caller (one fill at a
// time), so a single reusable worker + per-call listener is sufficient.
let fillWorker: Worker | null = null;
const FILL_TIMEOUT_MS = 15_000;
const pendingFillRequests = new Set<{
	reject: (reason?: unknown) => void;
	cleanup: () => void;
}>();

function getFillWorker(): Worker {
	if (!fillWorker) {
		fillWorker = new Worker(
			new URL("./bucketFill.worker.ts", import.meta.url),
			{ type: "module" },
		);
	}
	return fillWorker;
}

function resetFillWorker(reason: Error): void {
	const pending = [...pendingFillRequests];
	pendingFillRequests.clear();
	for (const request of pending) {
		request.cleanup();
		request.reject(reason);
	}
	fillWorker?.terminate();
	fillWorker = null;
}

export function shutdownBucketFillWorker(): void {
	resetFillWorker(new DOMException("Drawing session ended", "AbortError"));
}

function runFloodFill(
	payload: FloodFillRequest,
	transfer: Transferable[],
	signal?: AbortSignal,
): Promise<FloodFillResponse> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("Bucket fill aborted", "AbortError"));
			return;
		}
		const w = getFillWorker();
		let settled = false;
		let request!: { reject: (reason?: unknown) => void; cleanup: () => void };
		const onMessage = (e: MessageEvent<FloodFillResponse>) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(e.data);
		};
		const onError = (e: ErrorEvent) => {
			if (settled) return;
			settled = true;
			resetFillWorker(e.error ?? new Error(e.message));
		};
		const onAbort = () => {
			if (settled) return;
			settled = true;
			// The scan cannot be cancelled inside the worker. Terminate it so the
			// expensive flood does not continue after its gesture/session has ended.
			resetFillWorker(new DOMException("Bucket fill aborted", "AbortError"));
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			resetFillWorker(new Error("Bucket fill worker timed out"));
		}, FILL_TIMEOUT_MS);
		const cleanup = () => {
			clearTimeout(timer);
			w.removeEventListener("message", onMessage);
			w.removeEventListener("error", onError);
			signal?.removeEventListener("abort", onAbort);
			pendingFillRequests.delete(request);
		};
		request = { reject, cleanup };
		pendingFillRequests.add(request);
		w.addEventListener("message", onMessage);
		w.addEventListener("error", onError);
		signal?.addEventListener("abort", onAbort, { once: true });
		w.postMessage(payload, transfer);
	});
}

/**
 * Thinnest stroke width (world units) among stroked objects. Fills/images
 * (no stroke) are ignored. No strokes at all → MAX_WORLD_DIM, which drives the
 * resolution math to base res + full region (the old fixed behaviour).
 */
function thinnestStroke(objs: FabricObject[]): number {
	let min = Number.POSITIVE_INFINITY;
	for (const o of objs) {
		if (o.stroke == null) continue;
		const w = o.strokeWidth;
		if (w != null && w > 0 && w < min) min = w;
	}
	return Number.isFinite(min) ? Math.max(1, min) : MAX_WORLD_DIM;
}

/**
 * Builds a smart virtual canvas anchored precisely on the user's click coordinate.
 * It functions perfectly even if the target objects are mostly off-screen.
 *
 * ADAPTIVE RESOLUTION
 * The offscreen buffer is a fixed MAX_OFFSCREEN_PIXELS square (perf-bounded), so
 * resolution and world-region size trade off. Pick pxScale to render even the
 * thinnest barrier as a solid >= MIN_BARRIER_PX line — otherwise a sub-pixel
 * stroke lets the radius-2 flood (see CustomFloodFill) leak and flood the world.
 * Hairline strokes → high res + small region; thick / no strokes → base res +
 * full region. No stroke bump needed: barriers are real at every scale.
 */
function buildSmartOffscreenCanvas(
	c: Canvas,
	clickPoint: Point,
	/** Buffer edge in px. Larger = more world coverage at the SAME pxScale (see
	 *  ESCALATION_BUFFERS), i.e. more reach with unchanged barrier legibility. */
	bufferPx: number = MAX_OFFSCREEN_PIXELS,
) {
	const { query, getZIndexMap } = useDrawObjectManager();

	// Probe a small neighborhood around the click for the thinnest stroke — the
	// barriers that actually enclose the fill are near the click. Sizing off the
	// global thinnest stroke would let one distant hairline collapse the region
	// and make fill coverage feel unpredictable.
	const probeRect: Rect = {
		x: clickPoint.x - MIN_WORLD_DIM / 2,
		y: clickPoint.y - MIN_WORLD_DIM / 2,
		w: MIN_WORLD_DIM,
		h: MIN_WORLD_DIM,
	};
	const probeMinStroke = thinnestStroke(query(probeRect));

	// pxScale is derived from the BASE buffer, so it is identical at every
	// escalation level — barrier legibility (and therefore leak behaviour) never
	// changes as we grow. A bigger buffer then simply covers MORE WORLD at that
	// same resolution.
	const minPxScale = MAX_OFFSCREEN_PIXELS / MAX_WORLD_DIM; // full region, base res
	const maxPxScale = MAX_OFFSCREEN_PIXELS / MIN_WORLD_DIM; // tightest region, max res
	const pxScale = Math.min(
		maxPxScale,
		Math.max(minPxScale, MIN_BARRIER_PX / probeMinStroke),
	);
	const off = bufferPx; // buffer edge for THIS attempt
	const worldDim = off / pxScale; // grows with the buffer; pxScale held fixed

	const expandLeft = clickPoint.x - worldDim / 2;
	const expandTop = clickPoint.y - worldDim / 2;
	const offscreen = document.createElement("canvas");
	offscreen.width = off;
	offscreen.height = off;
	const ctx = offscreen.getContext("2d", { alpha: false })!;

	ctx.fillStyle = (c.backgroundColor as string) || "#ffffff";
	ctx.fillRect(0, 0, off, off);

	ctx.setTransform(
		pxScale,
		0,
		0,
		pxScale,
		-expandLeft * pxScale,
		-expandTop * pxScale,
	);

	const renderRect: Rect = {
		x: expandLeft,
		y: expandTop,
		w: worldDim,
		h: worldDim,
	};

	const objectsToRender = query(renderRect);
	getZIndexMap();

	objectsToRender.sort(compareRenderOrder);

	// ZOOM-INDEPENDENT BARRIERS
	// Fabric caches each object's bitmap at a resolution tied to the on-screen
	// zoom. Zoomed out, that cache is low-res, so rendering it into the offscreen
	// upscales a blurry, thinned barrier — the flood then leaks or stops short and
	// the fill loses accuracy. Disable caching for this pass so objects draw their
	// vectors directly at our controlled pxScale, crisp at any zoom. Restore after.
	for (const obj of objectsToRender) {
		const cached = obj.objectCaching;
		obj.objectCaching = false;
		obj.render(ctx);
		obj.objectCaching = cached;
	}

	return {
		offscreen,
		worldRect: renderRect,
		pxScale,
		// Thinnest barrier actually inside the final region — bounds the fill bleed
		// so the under-tuck never pokes out the far side of a thin stroke.
		minStrokeWorld: thinnestStroke(objectsToRender),
	};
}

export async function bucketFill(
	c: Canvas,
	p: Point,
	signal?: AbortSignal,
): Promise<BucketFillPath | null> {
	const { brushColorWithOpacity } = usePen();

	// Fix precision floating issues in Fabric generation
	// @ts-expect-error
	FabricObject.NUM_FRACTION_DIGITS = 1;

	const brushColor = brushColorWithOpacity();

	// Try progressively larger buffers while the fill keeps reaching the border.
	// Level 0 is EXACTLY the previous behaviour, so the common (small) fill costs
	// nothing extra — only a fill that would previously have been rejected as
	// "Area too large" pays for a retry. See ESCALATION_BUFFERS.
	let result!: FloodFillResponse;
	let worldRect!: Rect;
	let pxScale = 0;
	let minStrokeWorld = 0;

	for (let level = 0; level < ESCALATION_BUFFERS.length; level++) {
		if (signal?.aborted)
			throw new DOMException("Bucket fill aborted", "AbortError");
		const built = buildSmartOffscreenCanvas(c, p, ESCALATION_BUFFERS[level]);
		const offscreen = built.offscreen;
		worldRect = built.worldRect;
		pxScale = built.pxScale;
		minStrokeWorld = built.minStrokeWorld;

		// Map absolute click onto localized pixels
		const fillX = Math.round((p.x - worldRect.x) * pxScale);
		const fillY = Math.round((p.y - worldRect.y) * pxScale);

		if (
			fillX < 0 ||
			fillY < 0 ||
			fillX >= offscreen.width ||
			fillY >= offscreen.height
		) {
			return null;
		}

		const offCtx = offscreen.getContext("2d")!;
		const imgData = offCtx.getImageData(
			0,
			0,
			offscreen.width,
			offscreen.height,
		);

		// Hand the pixel scan + contour tracing to the worker. The ImageData buffer
		// is transferred (zero-copy) — it's not used again on this thread.
		result = await runFloodFill(
			{
				buffer: imgData.data.buffer,
				width: imgData.width,
				height: imgData.height,
				fillX,
				fillY,
				pxScale,
				worldRectX: worldRect.x,
				worldRectY: worldRect.y,
				rdpTolerance: RDP_TOLERANCE,
				maxWorldArea: MAX_WORLD_AREA,
			},
			[imgData.data.buffer],
			signal,
		);

		// Release the (now large) scratch canvas before a retry allocates the next.
		offscreen.width = offscreen.height = 0;

		// Only an EDGE rejection is worth retrying — it means "didn't fit", which a
		// bigger buffer can fix. Anything else (success, empty, enclosed-but-huge)
		// is final.
		if (!(result.edgeTouched && level < ESCALATION_BUFFERS.length - 1)) break;
	}

	if (!result.ok) {
		if (result.tooLarge) {
			useToast().toast("Area too large", { color: "warning" });
		}
		return null;
	}

	const svgPath = result.svgPath!;
	const centerX = result.centerX!;
	const centerY = result.centerY!;

	// Bleed the fill outward (world units) so its edge tucks under the surrounding
	// strokes and no anti-aliased seam shows. Clamp to half the thinnest barrier so
	// the tuck never pokes out the far side of a thin stroke.
	const worldUnitBleedExpansion = Math.min(BASE_BLEED, minStrokeWorld / 2);

	return new BucketFillPath(svgPath, {
		fill: brushColor,
		stroke: brushColor,
		strokeWidth: worldUnitBleedExpansion,
		strokeLineJoin: "round",
		strokeLineCap: "round",
		isBucketFill: true,
		left: centerX,
		top: centerY,
		fillRule: "evenodd",
		paintFirst: "stroke",
	});
}
