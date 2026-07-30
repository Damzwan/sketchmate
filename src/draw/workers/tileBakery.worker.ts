// tileBakery.worker.ts
//
// Off-thread tile rasterizer backed by a LEAN mirror. Two lessons from the
// first attempt drive this design:
//
//   1. The mirror is NOT a second scene graph. It stores raw JSON (cheap
//      strings) per id and enlivens fabric objects ON DEMAND for the tile being
//      baked, keeping at most LIVE_MAX of them (LRU). Worker live-object memory
//      is therefore bounded by the working set (a screenful of tiles), not the
//      scene size — no "double RAM tax", no GC panic on a 10k-object board.
//   2. The worker never touches images: image tiles are refused main-side, so
//      there is no fetch, no CORS surprise, no double download, and no fake
//      HTMLImageElement to keep fabric happy. The only DOM shim is a canvas.
//
// Consistency guarantees the main-thread bakery client relies on:
//   • postMessage is FIFO and the handler below is FIFO-chained, so an upsert /
//     translate posted before a bake is applied before that bake renders.
//   • A bake for an id the mirror lacks replies { missing }; the client
//     re-upserts once and retries, then falls back to a main-thread bake.
//   • Rendering matches CommittedLayer.rebuildTile exactly: same overscan
//     translate, same pad+clip, objects drawn in the id order provided.

import { classRegistry, util } from "fabric";
import { ClippingGroup } from "@erase2d/fabric";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { PixelStroke } from "@/draw/utils/brushes/PixelBrush";
import { CharcoalStroke } from "@/draw/utils/brushes/CharcoalBrush";
import { WaterColorStroke } from "@/draw/utils/brushes/WaterColorBrush";
import { CalligraphyStroke } from "@/draw/utils/brushes/CalligraphyBrush";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import { CircleStroke } from "@/draw/utils/brushes/CustomCircleBrush";
import { NeonStroke } from "@/draw/utils/brushes/NeonSignBrush";
import { SprayStroke } from "@/draw/utils/brushes/CustomSprayBrush";
import { CrayonStroke } from "@/draw/utils/brushes/CrayonBrush";
import type {
	BakeryRequest,
	BakeryResponse,
} from "@/draw/rendering/bakery/bakery.types";
import { WORKER_FONTS } from "@/draw/config/workerFonts.config";

// --- fonts -------------------------------------------------------------------
// A worker has no CSS, so text used to be refused per-tile (wrong metrics in a
// committed tile is a correctness bug). Chromium exposes WorkerGlobalScope.fonts,
// so register the same faces the page uses and text becomes bakeable here.
//
// The main side is told EXACTLY which families succeeded and refuses any tile
// whose text uses something else — a partially-loaded set must never silently
// fall back to a default face.
const loadedFamilies = new Set<string>();

async function loadFonts(): Promise<string[]> {
	const fonts = (self as any).fonts;
	if (!fonts || typeof FontFace === "undefined") return [];
	await Promise.all(
		WORKER_FONTS.map(async (spec) => {
			try {
				const face = new FontFace(spec.family, `url(${spec.url})`, {
					weight: spec.weight,
					style: "normal",
				});
				await face.load();
				fonts.add(face);
				loadedFamilies.add(spec.family);
			} catch {
				/* one bad face must not block the rest — main side just keeps
           refusing tiles that use it */
			}
		}),
	);
	return [...loadedFamilies];
}

// --- minimal DOM shim (canvas only; images never reach the worker) ----------
const applyCanvasDisguise = (canvas: any) => {
	canvas.hasAttribute = () => false;
	canvas.getAttribute = () => null;
	canvas.setAttribute = () => {};
	canvas.removeAttribute = () => {};
	canvas.style = {};
	canvas.classList = {
		add: () => {},
		remove: () => {},
		contains: () => false,
		toggle: () => {},
	};
	canvas.addEventListener = () => {};
	canvas.removeEventListener = () => {};
	canvas.dir = "ltr";
	return canvas;
};

if (typeof document === "undefined") {
	(globalThis as any).document = {
		createElement: (tag: string) => {
			if (tag === "canvas")
				return applyCanvasDisguise(new OffscreenCanvas(1, 1));
			if (tag === "img") {
				// FAIL FAST — never hang.
				//
				// fabric's `loadImage` does `img.onload = …; img.onerror = …; img.src = url`
				// and returns a promise that settles from those events. This shim used
				// to swallow all of it, so NO event ever fired and the promise NEVER
				// SETTLED. Any enliven that touched an image — e.g. an erased object
				// whose clipPath holds a flattened bitmap mask — hung forever, and
				// because the message pump is serial that parked EVERY later message:
				// `case 'bake'` simply stopped running and every request timed out.
				// A hang is also invisible to `Promise.allSettled`, so the per-object
				// isolation could not contain it either.
				//
				// Rejecting immediately turns that unrecoverable stall into one
				// skipped object: the tile bakes without it and the pump keeps going.
				// The main side additionally refuses such objects up front (see
				// hasImageClip) so they render correctly via a local bake.
				const el: any = {
					_src: "",
					_handlers: Object.create(null),
					addEventListener(type: string, cb: any) {
						el._handlers[type] = cb;
					},
					removeEventListener(type: string) {
						delete el._handlers[type];
					},
					setAttribute: () => {},
					getAttribute: () => null,
					style: {},
					width: 0,
					height: 0,
					complete: false,
					naturalWidth: 0,
					naturalHeight: 0,
					onload: null as any,
					onerror: null as any,
				};
				Object.defineProperty(el, "src", {
					get: () => el._src,
					set: (v: string) => {
						el._src = v;
						if (!v) return;
						queueMicrotask(() => {
							const err = new Error(
								"image loading is unsupported in the tile worker",
							);
							try {
								el.onerror?.(err);
							} catch {
								/* ignore */
							}
							try {
								el._handlers.error?.(err);
							} catch {
								/* ignore */
							}
						});
					},
				});
				return el;
			}
			return {};
		},
	};
	(globalThis as any).window = globalThis;
}

const brushes = [
	[OptimizedEraserStroke, "OptimizedEraserStroke"],
	[PixelStroke, "PixelStroke"],
	[CharcoalStroke, "CharcoalStroke"],
	[WaterColorStroke, "WaterColorStroke"],
	[CalligraphyStroke, "CalligraphyStroke"],
	[BucketFillPath, "BucketFillPath"],
	[OptimizedPencilStroke, "OptimizedPencilStroke"],
	[CircleStroke, CircleStroke.type],
	[SprayStroke, SprayStroke.type],
	[NeonStroke, NeonStroke.type],
	[CrayonStroke, CrayonStroke.type],
] as const;
brushes.forEach(([cls, name]) => classRegistry.setClass(cls as any, name));

// Register the eraser's clip class (type 'clipping'). It self-registers via a
// module side-effect on the MAIN thread (CustomEraserBrush imports it), but the
// worker never imported it — so enlivening an erased object here found no class
// for 'clipping' and dropped its clip. Result: erased holes REAPPEARED in
// worker-baked tiles (or the object failed to enliven and vanished). Explicit
// setClass so the import isn't tree-shaken and the mask bakes correctly.
classRegistry.setClass(ClippingGroup as any);

// --- lean mirror -------------------------------------------------------------
// json: the source of truth — one raw JSON blob per id. Cheap to hold at scale.
// live: bounded LRU of enlivened fabric objects. Map insertion order === LRU
//       order (touch = delete+set). Evicted down to LIVE_MAX after each bake.
const json = new Map<string, any>();
let jsonBytes = 0;
const live = new Map<string, any>();
// id → transferred pixels for a bitmap-backed stroke (see the 'asset' message).
// NOT evicted here: the main side owns the budget and never re-sends, so a
// silent eviction would leave an object permanently unrenderable. Freed only on
// remove/clear, where the bitmap is explicitly closed.
const assets = new Map<string, ImageBitmap>();

function dropAsset(id: string): void {
	const a = assets.get(id);
	if (a) {
		a.close();
		assets.delete(id);
	}
}

// Two caps, deliberately. LIVE_MAX is the WORKING cap during a bake pass: it
// must exceed the whole viewport's object count or tiles evict each other's
// objects and re-enliven them (thrash). IDLE_MAX is the AT-REST cap so a board
// smaller than LIVE_MAX doesn't sit permanently fully-enlivened here — that
// would recreate the "double RAM" second scene graph this mirror exists to
// avoid.
//
// BUT the at-rest cap must not fire between ordinary INTERACTIONS. It was 192
// objects after 4s, which meant: pause for four seconds, then zoom — and the
// worker had thrown away nearly every enlivened object and had to rebuild them
// all from JSON. That was masked for a long time because the remote OVERVIEW
// re-enlivened the entire scene on every rebuild and kept the LRU hot as a side
// effect; once the overview moved back to the main thread (R7, and correctly so)
// nothing re-warmed it, and every zoom paid a full cold re-enliven. Hence
// "sharpening takes ages" appearing right after that fix.
//
// A pause of a few seconds is normal use, not "at rest". 30s with a much larger
// floor keeps the working set across interaction while still releasing memory on
// a genuinely idle canvas.
let LIVE_MAX = 1536;
let IDLE_MAX = 768;
let JSON_MAX_BYTES = 96 * 1024 * 1024;
const IDLE_SHRINK_MS = 30_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function storedJsonBytes(raw: any): number {
	if (typeof raw === "string") return raw.length * 2;
	try {
		return JSON.stringify(raw).length * 2;
	} catch {
		return 0;
	}
}

function setJson(id: string, raw: any): void {
	const previous = json.get(id);
	if (previous !== undefined) jsonBytes -= storedJsonBytes(previous);
	json.delete(id);
	json.set(id, raw);
	jsonBytes += storedJsonBytes(raw);
}

function touchJson(id: string, raw: any): void {
	json.delete(id);
	json.set(id, raw);
}

function dropJson(id: string): void {
	const raw = json.get(id);
	if (raw === undefined) return;
	jsonBytes -= storedJsonBytes(raw);
	json.delete(id);
}

function shrinkJsonToBytes(cap: number): void {
	while (jsonBytes > cap) {
		const oldest = json.keys().next();
		if (oldest.done) break;
		dropJson(oldest.value);
		// The live copy can carry path and clipping cache canvases. Keeping it
		// after its source was evicted defeats the mirror's memory ceiling.
		live.delete(oldest.value);
	}
}

/** Drop the LRU tail down to `cap`. json stays — objects re-enliven on demand. */
function shrinkTo(cap: number): void {
	while (live.size > cap) {
		const oldest = live.keys().next();
		if (oldest.done) break;
		live.delete(oldest.value);
	}
}

function scheduleIdleShrink(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		idleTimer = null;
		shrinkTo(IDLE_MAX);
		shrinkJsonToBytes(JSON_MAX_BYTES);
	}, IDLE_SHRINK_MS);
}

function touch(id: string, obj: any): void {
	live.delete(id);
	live.set(id, obj);
}

function evictLive(protectedIds?: Set<string>): void {
	if (live.size <= LIVE_MAX) return;
	for (const id of live.keys()) {
		if (live.size <= LIVE_MAX) break;
		if (protectedIds?.has(id)) continue;
		live.delete(id); // drop the enlivened copy; json stays, re-enlivens on demand
	}
}

/** Enliven (or fetch from LRU) the object for `id`. Null if json unknown. */
async function ensureLive(id: string): Promise<any | null> {
	const cached = live.get(id);
	if (cached) {
		touch(id, cached);
		return cached;
	}
	const raw = json.get(id);
	if (raw === undefined) return null;
	touchJson(id, raw);
	let obj: any;
	try {
		// The mirror stores STRINGS (see the upsert handler) — a JSON string is far
		// smaller than its parsed object graph, and the mirror holds the whole
		// shippable scene forever, so on a big board this is the dominant non-tile
		// allocation. Parse on demand here (off the main thread); enliven parses
		// its input anyway, so the extra cost is small. Tolerates a legacy object.
		const j = typeof raw === "string" ? JSON.parse(raw) : raw;
		// Hand a bitmap-backed stroke its pixels. The stroke classes prefer
		// `__workerBitmap` over regenerating/decoding (Pixel takes it as
		// `stampCanvas`, short-circuiting its loadImage). Shallow-copied so the
		// stored JSON stays clean and re-enlivening picks the asset up again.
		const asset = assets.get(id);
		[obj] = await util.enlivenObjects([
			asset
				? { ...j, __workerBitmap: asset, stampCanvas: j.stampCanvas ?? asset }
				: j,
		]);
	} catch {
		return null;
	}
	if (!obj) return null;
	touch(id, obj);
	return obj;
}

/**
 * Maximum cold objects constructed concurrently.
 *
 * A Pixel trace found a 399-object tile taking 305ms. Starting every
 * `enlivenObjects` promise at once made that whole burst effectively
 * uninterruptible: the worker could not service a gesture's cancel message
 * until all of them settled. Sixteen keeps Fabric's useful parallelism without
 * turning a dense tile into one giant CPU/allocation spike.
 */
const ENLIVEN_BATCH_SIZE = 16;

/**
 * Enliven MANY ids in bounded batches, returning them aligned to `ids`.
 *
 * Returns null when the request epoch becomes stale. Partial results stay in
 * the LRU: they are correct and make the eventual post-gesture bake cheaper.
 */
async function ensureLiveMany(
	ids: string[],
	requestEpoch: number,
): Promise<(any | null)[] | null> {
	const out: (any | null)[] = new Array(ids.length).fill(null);
	const needIdx: number[] = [];
	const needJson: any[] = [];

	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		const cached = live.get(id);
		if (cached) {
			touch(id, cached);
			out[i] = cached;
			continue;
		}
		const raw = json.get(id);
		if (raw === undefined) continue;
		touchJson(id, raw);
		try {
			const j = typeof raw === "string" ? JSON.parse(raw) : raw;
			const asset = assets.get(id);
			needJson.push(
				asset
					? { ...j, __workerBitmap: asset, stampCanvas: j.stampCanvas ?? asset }
					: j,
			);
			needIdx.push(i);
			// JSON.parse itself is part of the cold-object burst. Yield while
			// PREPARING the Fabric inputs as well as while enlivening them, otherwise
			// a tile with several large path payloads can still hide cancellation.
			if (needJson.length % ENLIVEN_BATCH_SIZE === 0) {
				await yieldToWorkerTasks();
				if (isStale(requestEpoch)) return null;
			}
		} catch {
			/* unparseable → stays null, tile renders without it */
		}
	}

	if (needJson.length) {
		// PER-OBJECT ISOLATION, concurrent only inside each bounded batch.
		//
		// `util.enlivenObjects(all)` is ALL-OR-NOTHING: one object whose
		// `fromObject` throws rejects the whole batch. The old fallback then
		// re-enlivened every object in the tile SEQUENTIALLY — so a single broken
		// stroke turned every bake of every tile containing it into the slowest
		// possible path. That is what made a dense board take "ages" and then blow
		// its timeout. (Observed with a WaterColorStroke.)
		//
		// allSettled over one-object calls contains a failure to its own slot. A
		// REAL task yield after every batch lets the out-of-band cancel handler
		// raise cancelEpoch before we construct the next batch.
		for (let start = 0; start < needJson.length; start += ENLIVEN_BATCH_SIZE) {
			if (isStale(requestEpoch)) return null;
			const end = Math.min(start + ENLIVEN_BATCH_SIZE, needJson.length);
			const jobs: Promise<any[]>[] = [];
			for (let k = start; k < end; k++) {
				jobs.push(util.enlivenObjects([needJson[k]]));
			}
			const results = await Promise.allSettled(jobs);
			for (let offset = 0; offset < results.length; offset++) {
				const k = start + offset;
				const r = results[offset];
				const i = needIdx[k];
				if (r.status === "fulfilled" && r.value[0]) {
					out[i] = r.value[0];
					touch(ids[i], out[i]);
				} else {
					noteEnlivenFailure(
						ids[i],
						needJson[k],
						r.status === "rejected" ? r.reason : null,
					);
				}
			}
			await yieldToWorkerTasks();
			if (isStale(requestEpoch)) return null;
		}
	}

	return out;
}

/**
 * Surface an object the worker cannot enliven.
 *
 * This was swallowed by a bare `catch {}`, so a stroke that consistently failed
 * was invisible: it silently vanished from every worker-baked tile AND dragged
 * the bake onto the slow path. Reported once per type, so a systematically
 * broken class is obvious without spamming a dense board.
 */
const reportedEnlivenFailures = new Set<string>();

function noteEnlivenFailure(id: string, srcJson: any, reason: any): void {
	const type = srcJson?.type ?? "unknown";
	if (reportedEnlivenFailures.has(type)) return;
	reportedEnlivenFailures.add(type);
	console.warn(
		`[TileBakery] worker cannot enliven "${type}" (id ${id}) — it will be ` +
			`missing from worker-baked tiles. Real bug in that class's fromObject:`,
		reason,
	);
}

/**
 * Make an object report the TIER scale as its total scaling for this render.
 *
 * `objectCaching = false` does not stop fabric caching: shouldCache() is
 * `objectCaching && … || needsItsOwnCache()`, and needsItsOwnCache() is true
 * whenever there's a clipPath — every ERASED object. The cache resolution comes
 * from getTotalObjectScaling(), which here (canvas === null) is just the object
 * scale, i.e. ZOOM 1 — so an erased object baked into a tier-8 tile was a
 * zoom-1 cache blown up 8x and never sharpened however far you zoomed.
 *
 * Reporting the tier scale makes _updateCacheCanvas() see zoomChanged and
 * regenerate the cache at tile resolution by itself.
 */
function rectHitsBounds(
	r: { x: number; y: number; w: number; h: number },
	b: { left: number; top: number; width: number; height: number },
): boolean {
	return !(
		b.left + b.width < r.x ||
		b.left > r.x + r.w ||
		b.top + b.height < r.y ||
		b.top > r.y + r.h
	);
}

function applyTierScaling(
	obj: any,
	tierScale: number,
	clipRect?: { x: number; y: number; w: number; h: number },
): void {
	obj.objectCaching = false;
	obj.getTotalObjectScaling = function () {
		return this.getObjectScaling().scalarMultiply(tierScale);
	};
	// The clipPath (eraser ClippingGroup) is ALWAYS cached for masking, at its OWN
	// scaling = zoom 1 here (canvas null) — so the erase mask rasterizes at 1x and
	// upscales to the tile tier, blurring erased edges when zoomed in. Give the
	// clip (and its stroke children) the same tier scaling so the mask bakes
	// sharp. No clip cull — a mask must render whole.
	if (obj.clipPath && typeof obj.clipPath.getObjectScaling === "function") {
		applyTierScaling(obj.clipPath, tierScale);
	}
	// Recurse into groups. A merged drawing is a Group: clearing caching on the
	// group alone left its CHILDREN caching (fabric assigns `objectCaching: true`
	// per instance from ownDefaults, and enlivened JSON carries it back), each
	// rasterized at zoom 1 here because `canvas` is null — merged art came out
	// visibly blurrier than the same paths ungrouped.
	if (!Array.isArray(obj._objects)) return;
	for (let i = 0; i < obj._objects.length; i++) {
		const child = obj._objects[i];
		// CULL: the group is ONE index entry spanning all its children, so every
		// tile overlapping that union would otherwise render every child (fabric
		// does not cull children of a group, and canvas is null here so there is no
		// offscreen check at all) — children × tiles work instead of children.
		// NB: mirror objects persist in the LRU across bakes, so `visible` MUST be
		// reset every time — never left false from a previous tile, or the child
		// vanishes from later tiles and from the overview (which passes no clip).
		let inTile = true;
		if (clipRect) {
			try {
				inTile = rectHitsBounds(clipRect, child.getBoundingRect());
			} catch {
				/* un-measurable child: render it */
			}
		}
		child.visible = inTile;
		if (!inTile) continue;
		applyTierScaling(child, tierScale, clipRect);
	}
}

// --- cancellation ------------------------------------------------------------
//
// The main side aborts a bake pass the moment a gesture starts, but that abort
// used to be a MAIN-THREAD flag only: every request already posted kept
// enlivening and rasterizing here, and the result was thrown away on arrival.
// On mobile that is the worst possible time to be busy — the worker's canvas is
// GPU-backed, so its raster and `transferToImageBitmap` contend with the very
// compositor frames the gesture needs (docs/DRAW_ENGINE_PERF.md findings F5/R5).
//
// `cancelEpoch` is the generation of the newest `cancel` seen. A request whose
// own epoch is older belongs to an abandoned pass and is dropped.
let cancelEpoch = 0;

function isStale(epoch: number | undefined): boolean {
	return epoch !== undefined && epoch < cancelEpoch;
}

/**
 * Give the worker event loop a real TASK boundary so an out-of-band `cancel`
 * message can run while a dense tile is being rasterized.
 *
 * `await Promise.resolve()` is not enough: it only yields to the microtask
 * queue, while Worker `message` events are tasks. A persistent MessageChannel
 * avoids the timer clamp and per-yield channel allocation. The timeout fallback
 * is only for unusual runtimes without MessageChannel.
 */
const workerYieldResolvers: Array<() => void> = [];
const workerYieldChannel =
	typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
if (workerYieldChannel) {
	workerYieldChannel.port1.onmessage = () => {
		workerYieldResolvers.shift()?.();
	};
}

function yieldToWorkerTasks(): Promise<void> {
	if (!workerYieldChannel) {
		return new Promise((resolve) => setTimeout(resolve, 0));
	}
	return new Promise((resolve) => {
		workerYieldResolvers.push(resolve);
		workerYieldChannel.port2.postMessage(0);
	});
}

/** Keep cancellation latency within roughly one frame without yielding after
 * every cheap object. One unusually expensive object remains the smallest unit
 * Fabric can safely interrupt. */
const RASTER_SLICE_MS = 8;

// --- rasterizer --------------------------------------------------------------
let renderCanvas: OffscreenCanvas | null = null;

function getRenderCanvas(size: number): OffscreenCanvas {
	if (
		!renderCanvas ||
		renderCanvas.width !== size ||
		renderCanvas.height !== size
	) {
		renderCanvas = new OffscreenCanvas(size, size);
	}
	return renderCanvas;
}

// Separate from the tile scratch so overview rebuilds do not resize the tile
// canvas back and forth.
let overviewCanvas: OffscreenCanvas | null = null;

function getOverviewCanvas(width: number, height: number): OffscreenCanvas {
	if (
		!overviewCanvas ||
		overviewCanvas.width !== width ||
		overviewCanvas.height !== height
	) {
		overviewCanvas = new OffscreenCanvas(width, height);
	}
	return overviewCanvas;
}

async function bake(req: Extract<BakeryRequest, { t: "bake" }>): Promise<void> {
	const { msgId, ids, world, scale, overscan, size } = req;

	// Gesture started while this sat in the FIFO queue. Rasterizing it now would
	// burn the worker AND the GPU on pixels the main side has already decided to
	// discard — and on mobile that raster contends with the compositor driving
	// the gesture. Drop it before doing any work.
	if (isStale(req.epoch)) {
		post({ msgId, aborted: true });
		return;
	}

	const missing = ids.filter((id) => !json.has(id));
	if (missing.length) {
		post({ msgId, missing });
		return;
	}

	// Enliven exactly the ids this tile needs (LRU-cached across overlapping
	// tiles in a bake burst). Cold objects are constructed in bounded batches so
	// a gesture can cancel before the whole dense tile has been materialized.
	const objs = await ensureLiveMany(ids, req.epoch);

	// Re-check after enlivening. The raster loop below also creates real task
	// boundaries so cancellation can land after rendering has begun.
	if (!objs || isStale(req.epoch)) {
		post({ msgId, aborted: true });
		return;
	}

	const canvas = getRenderCanvas(size);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		post({ msgId, error: "no 2d context" });
		return;
	}

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, size, size);
	ctx.save();
	ctx.translate(overscan, overscan);
	ctx.scale(scale, scale);
	ctx.translate(-world.x, -world.y);

	// Same pad+clip as CommittedLayer.rebuildTile — pixel-identical output.
	const pad = overscan / scale + 4 / scale;
	const q = {
		x: world.x - pad,
		y: world.y - pad,
		w: world.w + 2 * pad,
		h: world.h + 2 * pad,
	};
	ctx.beginPath();
	ctx.rect(q.x, q.y, q.w, q.h);
	ctx.clip();

	let sliceStartedAt = performance.now();
	for (let i = 0; i < objs.length; i++) {
		const obj = objs[i];
		if (!obj) continue;
		obj.visible = true;
		obj.canvas = null;
		obj.objectCaching = false;
		obj.dirty = true;
		if (obj.clipPath) obj.clipPath.dirty = true;
		applyTierScaling(obj, scale, q);
		ctx.save();
		try {
			obj.render(ctx as any);
		} catch {
			/* one bad object must not kill the tile */
		} finally {
			ctx.restore();
		}

		if (performance.now() - sliceStartedAt >= RASTER_SLICE_MS) {
			await yieldToWorkerTasks();
			if (isStale(req.epoch)) {
				ctx.restore();
				post({ msgId, aborted: true });
				return;
			}
			sliceStartedAt = performance.now();
		}
	}
	ctx.restore();

	// Keep this tile's objects; trim the rest of the LRU back to the cap.
	evictLive(new Set(ids));
	scheduleIdleShrink();

	const bitmap = canvas.transferToImageBitmap();
	post({ msgId, bitmap }, [bitmap]);
}

/**
 * Whole-board overview render. Same math as WorldOverview's local rebuild:
 * fit `bounds` into the requested bitmap, draw z-ordered ids. Objects are enlivened through
 * the same LRU as tiles (so a subsequent viewport bake reuses them). A fresh
 * offscreen is used per call — the overview canvas outlives the request on the
 * main side as a bitmap, so we must not reuse the tile scratch.
 */
async function overview(
	req: Extract<BakeryRequest, { t: "overview" }>,
): Promise<void> {
	const { msgId, ids, bounds, width, height, scale } = req;
	if (isStale(req.epoch)) {
		post({ msgId, aborted: true });
		return;
	}
	if (bounds.w <= 0 || bounds.h <= 0) {
		post({ msgId, error: "bad bounds" });
		return;
	}
	// Report unknown ids instead of silently rendering a blank overview — the
	// caller re-upserts + retries, else falls back to a local render. Without
	// this a not-yet-seeded mirror produces an empty base layer = blank canvas
	// when zoomed out (overview tier is the whole picture).
	const missing = ids.filter((id) => !json.has(id));
	if (missing.length) {
		post({ msgId, missing });
		return;
	}
	// Pooled, like the tile scratch. Reallocating this bitmap every rebuild was
	// significant GPU-memory churn on Adreno.
	// transferToImageBitmap() detaches the backing store and leaves the canvas
	// reusable at the same size, so one instance serves every rebuild.
	const canvas = getOverviewCanvas(width, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		post({ msgId, error: "no 2d context" });
		return;
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, width, height);
	const sx = width / bounds.w;
	const sy = height / bounds.h;
	ctx.setTransform(sx, 0, 0, sy, -bounds.x * sx, -bounds.y * sy);

	let sliceStartedAt = performance.now();
	for (let i = 0; i < ids.length; i++) {
		// A warm-cache `await ensureLive()` only crosses a microtask boundary, which
		// does NOT let a Worker message task run. The timed task yield below is what
		// makes an in-progress overview genuinely cancellable.
		if (isStale(req.epoch)) {
			post({ msgId, aborted: true });
			return;
		}
		const obj = await ensureLive(ids[i]);
		if (!obj) continue;
		obj.visible = true;
		obj.canvas = null;
		obj.objectCaching = false;
		obj.dirty = true;
		if (obj.clipPath) obj.clipPath.dirty = true;
		applyTierScaling(obj, Math.max(sx, sy));
		ctx.save();
		try {
			obj.render(ctx as any);
		} catch {
			/* one bad object must not kill the overview */
		} finally {
			ctx.restore();
		}
		// The overview is a streaming render: objects already painted do not need
		// to remain live until the whole 10k-object board finishes. Keep the LRU
		// bounded throughout, not only after the final object.
		if ((i & 63) === 63) shrinkTo(LIVE_MAX);

		if (performance.now() - sliceStartedAt >= RASTER_SLICE_MS) {
			await yieldToWorkerTasks();
			if (isStale(req.epoch)) {
				post({ msgId, aborted: true });
				return;
			}
			sliceStartedAt = performance.now();
		}
	}
	evictLive();
	scheduleIdleShrink();

	const bitmap = canvas.transferToImageBitmap();
	post({ msgId, bitmap }, [bitmap]);
}

function post(msg: BakeryResponse, transfer: Transferable[] = []): void {
	(self as any).postMessage(msg, transfer);
}

// --- FIFO message pump -------------------------------------------------------
// Chained so upsert/translate posted before a bake is applied before it renders.
let chain: Promise<void> = Promise.resolve();

/**
 * Hard ceiling on a single awaited handler (bake / overview).
 *
 * The pump is strictly serial, so ONE handler that never settles parks every
 * later message FOREVER — the worker goes silent, every request times out, and
 * the bakery pauses while the worker looks "stuck" because it genuinely is. That
 * is not hypothetical: several `fromObject` implementations await image decoding
 * (`fabric.util.loadImage`), and the worker's `img` DOM shim never fires a load
 * or error event, so such a promise can hang indefinitely.
 *
 * Losing one tile to a local bake is always better than losing the pump.
 */
const HANDLER_WATCHDOG_MS = 15_000;

function withWatchdog<T>(work: Promise<T>, what: string): Promise<T> {
	return Promise.race([
		work,
		new Promise<T>((_, reject) =>
			setTimeout(
				() => reject(new Error(`${what} exceeded ${HANDLER_WATCHDOG_MS}ms`)),
				HANDLER_WATCHDOG_MS,
			),
		),
	]);
}

self.onmessage = (e: MessageEvent<BakeryRequest>) => {
	const msg = e.data;
	// OUT OF BAND — deliberately NOT chained.
	//
	// The pump below is strictly serial, so a chained `cancel` would queue behind
	// the very bake it is meant to cancel and only take effect once that bake had
	// already finished: worse than useless. Applying it here, synchronously in the
	// message handler, means it lands during the in-flight bake's `await` and
	// every request still sitting in the chain sees the new epoch immediately.
	//
	// Safe to reorder because it carries no state the FIFO guarantee protects: it
	// only ever raises a counter, and requests are compared against it, never
	// mutated by it.
	if (msg.t === "cancel") {
		if (msg.epoch > cancelEpoch) cancelEpoch = msg.epoch;
		return;
	}
	const run = async () => {
		try {
			switch (msg.t) {
				case "config":
					if (typeof msg.liveMax === "number" && msg.liveMax > 0) {
						LIVE_MAX = msg.liveMax;
					}
					IDLE_MAX =
						typeof msg.idleMax === "number" && msg.idleMax > 0
							? Math.min(LIVE_MAX, msg.idleMax)
							: Math.max(768, Math.floor(LIVE_MAX / 4));
					if (typeof msg.jsonMaxBytes === "number" && msg.jsonMaxBytes > 0) {
						JSON_MAX_BYTES = msg.jsonMaxBytes;
					}
					shrinkTo(LIVE_MAX);
					shrinkJsonToBytes(JSON_MAX_BYTES);
					// Register fonts and tell the client which families are safe to send.
					//
					// DELIBERATELY NOT AWAITED. This handler runs inside the FIFO chain, so
					// `await loadFonts()` here parked EVERY subsequent message — every
					// upsert, every bake — behind ~10 font fetches + decodes. On a cold
					// cache that stalled the whole mirror for seconds: the drawing stayed
					// blank long after the loading indicator went away, and the first
					// zoom took far longer to sharpen. Fire it off and reply when it
					// lands; the FIFO guarantee we actually need (upserts applied before
					// the bake that reads them) is unaffected, and text tiles stay refused
					// main-side until the `fonts` reply arrives, so nothing can bake with
					// a missing face in the meantime.
					void loadFonts().then((fonts) => post({ msgId: -1, fonts }));
					break;
				case "upsert":
					for (const item of msg.items) {
						// Store as a STRING, not the parsed graph — see ensureLive. Halves
						// the mirror's steady-state memory on a large board (its biggest
						// non-tile cost). Stringify runs off the main thread. Fall back to
						// the object if it isn't serializable (main already sanitizes).
						let stored: any = item.json;
						try {
							stored = JSON.stringify(item.json);
						} catch {
							/* keep the object */
						}
						setJson(item.id, stored);
						live.delete(item.id); // geometry may have changed → re-enliven fresh
					}
					scheduleIdleShrink();
					break;
				case "translate": {
					// Pure world translation (drag commit): patch coords in place instead
					// of shipping N re-serialized objects. Top-level objects only, so a
					// world shift is a left/top shift. The stored json is a string, so
					// parse+patch+re-stringify here (off the main thread); the main side
					// still sends only this one tiny message.
					const { dx, dy } = msg;
					for (const id of msg.ids) {
						const raw = json.get(id);
						if (raw !== undefined) {
							try {
								const j = typeof raw === "string" ? JSON.parse(raw) : raw;
								if (typeof j.left === "number") j.left += dx;
								if (typeof j.top === "number") j.top += dy;
								setJson(id, typeof raw === "string" ? JSON.stringify(j) : j);
							} catch {
								/* leave as-is; a later upsert corrects it */
							}
						}
						const o = live.get(id);
						if (o) {
							o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
							o.setCoords();
						}
					}
					scheduleIdleShrink();
					break;
				}
				case "clipSet": {
					// An erase changed only this object's clipPath. Patch it in the stored
					// JSON instead of re-serializing the whole object main-side. `clip` is
					// exactly what clipPath.toObject() produced, so this yields the
					// identical mirror a full upsert would. No-op if the id is unknown —
					// the next bake reports `missing` and re-upserts in full.
					const raw = json.get(msg.id);
					if (raw !== undefined) {
						try {
							const j = typeof raw === "string" ? JSON.parse(raw) : raw;
							if (msg.clip) j.clipPath = msg.clip;
							else delete j.clipPath;
							setJson(msg.id, typeof raw === "string" ? JSON.stringify(j) : j);
						} catch {
							/* leave as-is; a later upsert / missing self-heal corrects it */
						}
						live.delete(msg.id); // clip changed → re-enliven fresh
					}
					scheduleIdleShrink();
					break;
				}
				case "asset": {
					dropAsset(msg.id); // replace → free the old pixels
					assets.set(msg.id, msg.bitmap);
					live.delete(msg.id); // re-enliven so the new bitmap is picked up
					break;
				}
				case "remove":
					for (const id of msg.ids) {
						dropJson(id);
						live.delete(id);
						dropAsset(id);
					}
					break;
				case "clear":
					json.clear();
					jsonBytes = 0;
					live.clear();
					for (const [, a] of assets) a.close();
					assets.clear();
					break;
				case "bake":
					await withWatchdog(bake(msg), "bake");
					break;
				case "overview":
					await withWatchdog(overview(msg), "overview");
					break;
			}
		} catch (err: any) {
			// Must not throw out of here — see the chain note below.
			try {
				if ((msg as any).msgId !== undefined) {
					post({
						msgId: (msg as any).msgId,
						error: err?.message ?? "worker error",
					});
				}
			} catch {
				/* reporting failed; the client's timeout still covers this request */
			}
		}
	};
	// REJECTION-PROOF. `chain.then(run)` alone means a single rejected handler
	// poisons the chain permanently: every later `.then(onFulfilled)` is skipped,
	// so the worker silently stops processing messages — no bake ever runs again
	// and every request times out until the bakery pauses. Passing `run` as BOTH
	// handlers makes the pump resume after a failure, and the trailing catch keeps
	// the stored promise settled. (Same pattern as enqueueHistoryOp.)
	chain = chain.then(run, run).catch(() => {});
};
