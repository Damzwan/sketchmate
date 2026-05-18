import { defineStore } from "pinia";
import { Canvas, FabricObject } from "fabric";
import { FabricEvent, ObjectType } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import {
	fabricObjectToEntry,
	getViewportRect,
	InfiniteQuadtreeManager,
	QuadtreeEntry,
	Rect,
} from "@/draw/utils/QuadTree";
import { useGestureStore } from "@/draw/store/tools/gesture.store";
import { useAuthStore } from "@/store/auth.store";
import { useSmartBitmapManager } from "@/draw/composables/useSmartBitmapManager";
import { isMobile } from "@/helper/general.helper";
import { renderWithLOD } from "@/draw/helpers/Lodrenderer";
import { IS_DEV } from "@/helper/general.helper";

// ─── Device Perf Class ────────────────────────────────────────────────────────
const IS_MOBILE = isMobile();
const HW_CONCURRENCY = (navigator as any).hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && HW_CONCURRENCY <= 4;

// MAX_BAKES_PER_GESTURE is now an UPPER BOUND. The actual count per gesture
// is determined by adaptiveBakeCap(visibleCount). These ceilings exist mainly
// to prevent runaway queue growth on absurdly dense scenes.
const MAX_BAKES_PER_GESTURE = IS_LOW_END ? 300 : IS_MOBILE ? 600 : 2000;
const BAKE_FRAME_BUDGET_MS = IS_LOW_END ? 4 : IS_MOBILE ? 6 : 8;
const SKIP_BAKE_IF_HIT_RATE = 0.95;

// Per-chunk render budget. Mobile yields back to the event loop faster.
const CHUNK_BUDGET_MS = IS_LOW_END ? 3 : IS_MOBILE ? 4 : 6;
// How often to peek at isInputPending inside a chunk (every N objects).
const INPUT_CHECK_INTERVAL = IS_LOW_END ? 1 : IS_MOBILE ? 2 : 5;

// ─── Render thresholds ────────────────────────────────────────────────────────
const PAN_THRESHOLD = 0.85;
const ZOOM_EPSILON = 0.0001;
// Per-step zoom change that's still small enough to scale-blit
const SMALL_ZOOM_DELTA = 2;
// Total drift from the last sharp render before we force a chunked re-render.
// Below this we keep scale-blitting (fast, slightly soft). Above this we
// invest in a real chunked render. 0.3 = 30% zoom drift.
const ACCUMULATION_THRESHOLD = 2;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface LastRenderState {
	vpt: number[];
	physWidth: number;
	physHeight: number;
}

interface PanInfo {
	dx: number;
	dy: number;
	exposedRects: Array<{ x: number; y: number; w: number; h: number }>;
	newVpt: number[];
}

type RenderDecision =
	| { type: "pan"; panInfo: PanInfo }
	| { type: "small-viewport"; newVpt: number[] }
	| {
			type: "full";
	  };

export const useDrawObjectManager = defineStore("drawObjectManager", () => {
	let c: Canvas | undefined = undefined;

	let objectMap = new Map<string, FabricObject>();
	const bitmapManager = useSmartBitmapManager();

	const quadtree = new InfiniteQuadtreeManager<FabricObject>();
	const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

	let lastVisible = new Set<string>();
	let visibilityScheduled = false;

	let isChunkedRenderRunning = false;
	let pendingBatchAfterRender = false;
	let pendingFullRerender = false;

	let zIndexMap = new Map<FabricObject, number>();
	let isZIndexDirty = true;

	let lastRenderState: LastRenderState | null = null;
	let lastFullRenderZoom = 1;

	const BITMAP_PADDING = 24;

	// ─── Unified Generation / Abort Tracking ───────────────────────────────────
	//
	// Every "work item" (render OR bake) is tagged with a generation number.
	// `currentGen` increments on every gesture start. Any work whose `gen` !==
	// `currentGen` is stale and must abort ASAP.
	//
	// We also keep separate AbortControllers for the latest render and the
	// latest bake schedule, so we can independently cancel them. But they share
	// the generation: if a gesture starts, BOTH controllers are aborted.
	//
	// This fixes the orphaned-bake bug: previously bakes were tied only to the
	// render's controller, which got nulled out in finalize(), making the bake
	// un-cancellable after a successful render completed.
	let currentGen = 0;
	let currentRenderController: AbortController | null = null;
	let currentBakeController: AbortController | null = null;

	function bumpGen(): number {
		currentGen++;
		return currentGen;
	}

	function isStale(gen: number, sig?: AbortSignal): boolean {
		return gen !== currentGen || (sig?.aborted ?? false);
	}

	function killAllInFlight() {
		currentRenderController?.abort();
		currentBakeController?.abort();
		currentRenderController = null;
		currentBakeController = null;
	}

	// ─── Canvas Event Handlers ─────────────────────────────────────────────────
	const events: FabricEvent[] = [
		{
			on: "object:added",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (!obj.id) return;
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
				const all = c!.getObjects(),
					last = all.length - 1;
				if (all[last]?.id === obj.id) zIndexMap.set(obj, last);
				else isZIndexDirty = true;
				scheduleInvalidation(obj);
			},
		},
		{
			on: "object:removed",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				if (!obj.id) return;
				scheduleInvalidation(obj);
				bitmapManager.invalidate(obj.id);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
				invalidateZIndex();
			},
		},
		{
			on: "object:modified",
			handler: (e: any) => {
				const obj = e.target as FabricObject,
					transform = e.transform;
				if (obj.type === ObjectType.selection) {
					c!.getActiveObjects().forEach((o) => {
						bitmapManager.invalidate(o.id);
						updateQuadTree(o);
					});
				} else {
					bitmapManager.invalidate(obj.id);
					updateQuadTree(obj);
				}
				if (transform?.original) {
					const prev = {
						left: obj.left,
						top: obj.top,
						scaleX: obj.scaleX,
						scaleY: obj.scaleY,
						skewX: obj.skewX,
						skewY: obj.skewY,
						angle: obj.angle,
						flipX: obj.flipX,
						flipY: obj.flipY,
						originX: obj.originX,
						originY: obj.originY,
					};
					obj.set(transform.original);
					obj.setCoords();
					// @ts-ignore
					const old = obj.getBoundingRect(true, true);
					obj.set(prev);
					obj.setCoords();
					scheduleRectInvalidation(
						new Rect(old.left, old.top, old.width, old.height),
					);
					scheduleInvalidation(obj);
				} else {
					scheduleInvalidation(obj);
				}
			},
		},
		{
			on: "fullErase",
			handler: () => {
				bitmapManager.clear();
				lastRenderState = null;
				lastFullRenderZoom = 1;
				const pw = c!.getElement().width,
					ph = c!.getElement().height;
				const sc = getStableCanvas(pw, ph).getContext("2d")!;
				sc.save();
				sc.setTransform(1, 0, 0, 1, 0, 0);
				sc.clearRect(0, 0, pw, ph);
				if (c!.backgroundColor) {
					sc.fillStyle = c!.backgroundColor as string;
					sc.fillRect(0, 0, pw, ph);
				}
				sc.restore();
			},
		},
		{ on: "textStyleChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "objectStyleChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "imgFilterChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "flip", handler: (e: any) => handleStyleChange(e) },
		{
			on: "layer:changed",
			handler: (e: any) => {
				scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target]);
				isZIndexDirty = true;
			},
		},
		{
			on: "erasing:end",
			handler: (e: any) => {
				const t = Array.isArray(e.detail.targets)
					? e.detail.targets
					: [e.detail.targets];
				t.forEach((o: FabricObject) => bitmapManager.invalidate(o.id));
				scheduleInvalidation(t);
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => {
				lastRenderState = null;
				lastFullRenderZoom = 1;
				updateVisibility(false);
			},
		},
		{
			on: "invalidateCanvas",
			handler: (e: any) => {
				const t = Array.isArray(e.target) ? e.target : [e.target];
				t.forEach((o: FabricObject) => bitmapManager.invalidate(o.id));
				scheduleInvalidation(t);
			},
		},
		{
			on: "render:patchModifiedObject",
			handler: (e: any) => {
				const obj = e.target as FabricObject,
					oldRect = e.oldRect as Rect;
				if (!obj || !oldRect) return;
				bitmapManager.invalidate(obj.id);
				updateQuadTree(obj);
				scheduleRectInvalidation(oldRect);
				scheduleInvalidation(obj);
			},
		},
	];

	function handleStyleChange(e: any) {
		const t = Array.isArray(e.target) ? e.target : [e.target];
		t.forEach((o: FabricObject) => {
			if (o.id) bitmapManager.invalidate(o.id);
		});
		scheduleInvalidation(t);
	}

	// ─── Public Accessors ──────────────────────────────────────────────────────
	function getObjectById(id: string) {
		return objectMap.get(id);
	}

	function getObjectsById(ids: string[]): FabricObject[] {
		return ids.map((id) => getObjectById(id)).filter(Boolean) as FabricObject[];
	}

	// ─── Initialisation ────────────────────────────────────────────────────────
	function init(canvas: Canvas) {
		c = canvas;
		addStartingCanvasObjects();
		useDrawEventManager().addPermanentEvents(events);
	}

	function addStartingCanvasObjects() {
		const blocked = useAuthStore().user?.blocked_users ?? [];
		objectMap = new Map();
		lastVisible = new Set();
		zIndexMap = new Map();
		isZIndexDirty = true;
		lastRenderState = null;
		lastFullRenderZoom = 1;
		quadtree.clear();
		for (let i = c!.getObjects().length - 1; i >= 0; i--) {
			const obj = c!.getObjects()[i];
			if (blocked.includes(obj.userId)) {
				c?.remove(obj);
				continue;
			}
			if (obj.id) {
				objectMap.set(obj.id, obj);
				addToQuadTree(obj);
			}
		}
	}

	// ─── Visibility & Full Re-render ───────────────────────────────────────────
	async function updateVisibility(runSync = true): Promise<void> {
		return new Promise<void>((resolve) => {
			const execute = () => {
				visibilityScheduled = false;
				const next = new Set<string>();

				for (const e of quadtree.query(getViewportRect(c!))) {
					const obj = objectMap.get(e.id);
					if (!obj) {
						const en = entryMap.get(e.id);
						if (en) quadtree.remove(en);
						continue;
					}
					next.add(e.id);
					if (!lastVisible.has(e.id)) obj.visible = true;
				}

				for (const id of lastVisible) {
					if (!next.has(id)) {
						const o = objectMap.get(id);
						if (o) o.visible = false;
					}
				}

				lastVisible = next;
				const vis: FabricObject[] = [];
				for (const id of next) {
					const o = objectMap.get(id);
					if (o) vis.push(o);
				}

				const zSnap = new Map(getZIndexMap());
				vis.sort((a, b) => (zSnap.get(a) ?? 0) - (zSnap.get(b) ?? 0));

				// Pass the Promise's resolve function into your chunked renderer
				renderCanvasChunked(c!, vis, zSnap, resolve);
			};

			if (!runSync) {
				execute();
				return;
			}

			// Failsafe: If a visibility update is already scheduled in an RAF loop,
			// resolve immediately so the awaiting code doesn't hang indefinitely.
			if (visibilityScheduled) {
				resolve();
				return;
			}

			visibilityScheduled = true;
			requestAnimationFrame(execute);
		});
	}

	// ─── Offscreen Buffers ─────────────────────────────────────────────────────
	let stableCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
	let workingCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

	function getStableCanvas(w: number, h: number) {
		if (!stableCanvas)
			stableCanvas =
				typeof OffscreenCanvas !== "undefined"
					? new OffscreenCanvas(w, h)
					: document.createElement("canvas");
		if (stableCanvas.width !== w || stableCanvas.height !== h) {
			stableCanvas.width = w;
			stableCanvas.height = h;
		}
		return stableCanvas;
	}

	function getWorkingCanvas(w: number, h: number) {
		if (!workingCanvas)
			workingCanvas =
				typeof OffscreenCanvas !== "undefined"
					? new OffscreenCanvas(w, h)
					: document.createElement("canvas");
		if (workingCanvas.width !== w || workingCanvas.height !== h) {
			workingCanvas.width = w;
			workingCanvas.height = h;
		}
		return workingCanvas;
	}

	// ─── Viewport Change Analysis ──────────────────────────────────────────────
	function analyzeViewportChange(
		newVpt: number[],
		pw: number,
		ph: number,
	): RenderDecision {
		if (!lastRenderState) return { type: "full" };
		const p = lastRenderState;
		if (p.physWidth !== pw || p.physHeight !== ph) return { type: "full" };
		const [pa, pb, pc, pd, pe, pf] = p.vpt;
		const [na, nb, nc, nd, ne, nf] = newVpt;
		const rotChg =
			Math.abs(nb - pb) > ZOOM_EPSILON || Math.abs(nc - pc) > ZOOM_EPSILON;
		const zoomChg =
			Math.abs(na - pa) > ZOOM_EPSILON || Math.abs(nd - pd) > ZOOM_EPSILON;
		const panChg = Math.abs(ne - pe) > 0.5 || Math.abs(nf - pf) > 0.5;
		if (rotChg) return { type: "full" };
		if (!zoomChg && panChg) {
			const dpr = getDpr();
			const dx = Math.round((ne - pe) * dpr),
				dy = Math.round((nf - pf) * dpr);
			const diag = Math.sqrt(pw * pw + ph * ph);
			const exp = Math.sqrt(
				Math.min(Math.abs(dx), pw) ** 2 + Math.min(Math.abs(dy), ph) ** 2,
			);
			if (exp / diag > PAN_THRESHOLD) return { type: "full" };
			const rects: PanInfo["exposedRects"] = [];
			if (dx !== 0)
				rects.push(
					dx > 0
						? { x: 0, y: 0, w: dx, h: ph }
						: { x: pw + dx, y: 0, w: -dx, h: ph },
				);
			if (dy !== 0) {
				const x0 = dx > 0 ? dx : 0,
					x1 = dx < 0 ? pw + dx : pw;
				rects.push(
					dy > 0
						? { x: x0, y: 0, w: x1 - x0, h: dy }
						: { x: x0, y: ph + dy, w: x1 - x0, h: -dy },
				);
			}
			return { type: "pan", panInfo: { dx, dy, exposedRects: rects, newVpt } };
		}
		if (zoomChg) {
			const drift =
				Math.abs(na - lastFullRenderZoom) / Math.max(lastFullRenderZoom, 0.001);
			const step = Math.abs(na - pa) / Math.max(pa, 0.001);
			if (drift < ACCUMULATION_THRESHOLD && step < SMALL_ZOOM_DELTA)
				return { type: "small-viewport", newVpt };
		}
		return { type: "full" };
	}

	// ─── Main Render Orchestrator ──────────────────────────────────────────────
	function renderCanvasChunked(
		canvas: Canvas,
		objects: FabricObject[],
		zSnap: Map<FabricObject, number>,
		onComplete?: () => void,
	) {
		// Tag this render with the CURRENT generation. If a gesture starts mid-
		// render, currentGen will bump and this render will see it's stale.
		const gen = currentGen;

		// Abort any previous render and start a new controller.
		currentRenderController?.abort();
		const ctrl = new AbortController();
		currentRenderController = ctrl;
		const sig = ctrl.signal;

		const gs = useGestureStore();
		pendingFullRerender = false;
		isChunkedRenderRunning = true;
		canvas.fire("render:pipeline:start" as any);

		const pw = canvas.getElement().width,
			ph = canvas.getElement().height;
		const vpt = [...canvas.viewportTransform!] as number[];
		const bg = canvas.backgroundColor;
		const dpr = getDpr(),
			zoom = vpt[0];
		const t0 = performance.now();

		const decision = analyzeViewportChange(vpt, pw, ph);

		if (
			(decision.type === "pan" || decision.type === "small-viewport") &&
			!isStale(gen, sig)
		) {
			const tele = { hits: 0, live: 0, bailReason: "" as string };
			const ok =
				decision.type === "pan"
					? applyIncrementalPan(
							canvas,
							decision.panInfo,
							zSnap,
							dpr,
							zoom,
							tele,
						)
					: applySmallViewport(
							canvas,
							decision.newVpt,
							objects,
							dpr,
							zoom,
							tele,
						);

			if (ok && !isStale(gen, sig)) {
				lastRenderState = { vpt, physWidth: pw, physHeight: ph };
				gs.setRenderedVpt(vpt);
				commitToMainScreen(canvas);
				canvas.fire("render:pipeline:end" as any);
				isChunkedRenderRunning = false;
				flushPendingBatch();
				if (IS_DEV)
					logRender(
						decision.type === "pan" ? "⚡ Pan" : "🔀 Small Viewport",
						t0,
						tele,
						objects.length,
					);

				const total = tele.hits + tele.live;
				const hitRate = total > 0 ? tele.hits / total : 1;
				if (hitRate < SKIP_BAKE_IF_HIT_RATE) {
					schedulePostGestureBake(objects, zoom, gen);
				}

				// For scale-blit, the stable canvas now contains scaled (soft) pixels.
				// Schedule a deferred SHARP chunked re-render to replace them. We tie
				// this to the current generation — if a new gesture starts, this is
				// skipped entirely.
				if (decision.type === "small-viewport") {
					scheduleDeferredSharpRender(gen);
				}
				if (onComplete) onComplete();
				return;
			}
			// Fast path failed or got stale — fall through to chunked.
			if (isStale(gen, sig)) {
				isChunkedRenderRunning = false;
				return;
			}
			if (IS_DEV && !ok) {
				// eslint-disable-next-line no-console
				console.warn(
					`[render] ${decision.type} fast-path bailed (${tele.bailReason}), falling to chunked. Objects=${objects.length}`,
				);
			}
		} else if (IS_DEV && decision.type === "full") {
			// eslint-disable-next-line no-console
			console.debug(
				"[render] decision=full (rotation, dimensions, or large delta)",
			);
		}

		// ── Full chunked render ─────────────────────────────────────────────────
		const wc = getWorkingCanvas(pw, ph);
		const wCtx = wc.getContext("2d") as
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D;

		wCtx.setTransform(1, 0, 0, 1, 0, 0);
		wCtx.clearRect(0, 0, wc.width, wc.height);

		if (bg) {
			wCtx.fillStyle = bg as string;
			wCtx.fillRect(0, 0, wc.width, wc.height);
		}
		wCtx.save();
		wCtx.setTransform(1, 0, 0, 1, 0, 0);
		wCtx.scale(dpr, dpr);
		wCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

		let i = 0,
			hits = 0,
			live = 0;

		const bailOut = () => {
			try {
				wCtx.restore();
			} catch {
				/* already restored */
			}
			isChunkedRenderRunning = false;
			if (onComplete) onComplete();
			// Don't flush pending batch on stale exit — a newer render is incoming
			// and will absorb our work.
		};

		// finalize is split into stages across RAF boundaries. The crucial
		// invariant: we DO NOT touch `stableCanvas` until the very last moment.
		// If we abort mid-finalize after blitting partial state to stable, the
		// next pan fast-path uses corrupt source data — that's the "sometimes
		// cancel doesn't work" symptom.
		//
		// Stages:
		//   A. wCtx.restore + drawControls (working canvas only)
		//   B. yield → check stale → commit working → stable → screen atomically
		//   C. yield → schedule bakes
		const finalize = () => {
			if (isStale(gen, sig)) {
				bailOut();
				return;
			}

			// Stage A: finish working canvas
			wCtx.restore();
			// @ts-ignore
			if (!canvas.skipControlsDrawing) {
				canvas.drawControls(wCtx as CanvasRenderingContext2D);
			}

			if (isStale(gen, sig)) {
				// Working canvas is now in a "complete frame" state but stable canvas
				// is untouched — safe to bail.
				isChunkedRenderRunning = false;
				if (onComplete) onComplete();
				return;
			}

			// Stage B: yield, then commit atomically.
			requestAnimationFrame(() => {
				if (isStale(gen, sig)) {
					isChunkedRenderRunning = false;
					if (onComplete) onComplete();
					return;
				}

				// All commits happen here, back to back, with no awaits in between.
				// This is the ONLY place we write to stableCanvas during a full
				// render — keeping it atomic.
				const sc = getStableCanvas(pw, ph);
				const sCtx = sc.getContext("2d")!;
				sCtx.clearRect(0, 0, sc.width, sc.height);
				sCtx.drawImage(wc as CanvasImageSource, 0, 0);

				gs.setRenderedVpt(vpt);
				lastFullRenderZoom = zoom;
				lastRenderState = { vpt, physWidth: pw, physHeight: ph };

				commitToMainScreen(canvas);
				canvas.fire("render:pipeline:end" as any);

				if (IS_DEV) logRender("🐢 Full", t0, { hits, live }, objects.length);

				isChunkedRenderRunning = false;
				flushPendingBatch();
				if (onComplete) onComplete();

				// Stage C: yield, then schedule bakes. Defer one more frame so input
				// events that came in during the commit get processed before we
				// start CPU-heavy bake work.
				requestAnimationFrame(() => {
					if (isStale(gen, sig)) return;
					schedulePostGestureBake(objects, zoom, gen, live);
					if (currentRenderController === ctrl) {
						currentRenderController = null;
					}
				});
			});
		};

		const scheduleChunk = () => {
			requestAnimationFrame(() => {
				if (isStale(gen, sig)) {
					bailOut();
					return;
				}
				chunk();
			});
		};

		// @ts-ignore
		const inputPending = () =>
			navigator.scheduling?.isInputPending?.({ includeContinuous: true }) ??
			false;

		const chunk = () => {
			if (isStale(gen, sig)) {
				bailOut();
				return;
			}

			const fs = performance.now();
			let n = 0;
			while (i < objects.length) {
				// Check stale at the TOP of each object — this is the abort granularity.
				if (isStale(gen, sig)) {
					bailOut();
					return;
				}

				const obj = objects[i];
				const bm = bitmapManager.getIfCompatible(obj.id, zoom);

				if (bm) {
					hits++;
					const b = bitmapManager.getBounds(obj);
					wCtx.drawImage(
						bm,
						b.left - BITMAP_PADDING,
						b.top - BITMAP_PADDING,
						b.width + BITMAP_PADDING * 2,
						b.height + BITMAP_PADDING * 2,
					);
				} else {
					live++;
					renderWithLOD(obj, wCtx, zoom);
				}

				i++;
				n++;
				// Yield much more aggressively. On low-end we check every object;
				// on mobile every 2; on desktop every 5. Budget is also tighter.
				if (n % INPUT_CHECK_INTERVAL === 0) {
					if (performance.now() - fs >= CHUNK_BUDGET_MS) break;
					if (inputPending()) break;
				}
			}

			if (i >= objects.length) {
				finalize();
				return;
			}
			scheduleChunk();
		};
		scheduleChunk();
	}

	// ─── Incremental Pan ───────────────────────────────────────────────────────
	//
	// Heartbeat raised to 12ms. The pan fast-path is the happy path; it
	// shouldn't bail on legitimate workloads. 7ms was correctness-bailing for
	// dense scenes and silently degrading to chunked.
	const FAST_PATH_BUDGET_MS = IS_LOW_END ? 8 : IS_MOBILE ? 10 : 12;

	function applyIncrementalPan(
		canvas: Canvas,
		pan: PanInfo,
		zSnap: Map<FabricObject, number>,
		dpr: number,
		zoom: number,
		tele: {
			hits: number;
			live: number;
			bailReason: string;
		},
	): boolean {
		try {
			const { dx, dy, exposedRects, newVpt } = pan;
			const pw = canvas.getElement().width,
				ph = canvas.getElement().height;
			const sc = getStableCanvas(pw, ph),
				sCtx = sc.getContext("2d") as
					| CanvasRenderingContext2D
					| OffscreenCanvasRenderingContext2D;
			const bg = canvas.backgroundColor;
			const wc = getWorkingCanvas(pw, ph),
				wCtx = wc.getContext("2d") as
					| CanvasRenderingContext2D
					| OffscreenCanvasRenderingContext2D;

			wCtx.setTransform(1, 0, 0, 1, 0, 0);
			wCtx.clearRect(0, 0, pw, ph);
			wCtx.drawImage(sc as CanvasImageSource, dx, dy);
			for (const r of exposedRects) {
				wCtx.clearRect(r.x, r.y, r.w, r.h);
				if (bg) {
					wCtx.fillStyle = bg as string;
					wCtx.fillRect(r.x, r.y, r.w, r.h);
				}
			}
			wCtx.save();
			wCtx.setTransform(1, 0, 0, 1, 0, 0);
			wCtx.scale(dpr, dpr);
			wCtx.transform(
				newVpt[0],
				newVpt[1],
				newVpt[2],
				newVpt[3],
				newVpt[4],
				newVpt[5],
			);
			const scale = newVpt[0],
				tx = newVpt[4],
				ty = newVpt[5];

			const heartBeatStart = performance.now();

			for (const strip of exposedRects) {
				const wx = (strip.x / dpr - tx) / scale,
					wy = (strip.y / dpr - ty) / scale;
				const ww = strip.w / dpr / scale,
					wh = strip.h / dpr / scale;
				const nb = query(new Rect(wx, wy, ww, wh));
				nb.sort((a, b) => (zSnap.get(a) ?? 0) - (zSnap.get(b) ?? 0));
				wCtx.save();
				wCtx.beginPath();
				wCtx.rect(
					wx - 2 / scale,
					wy - 2 / scale,
					ww + 4 / scale,
					wh + 4 / scale,
				);
				wCtx.clip();
				for (const obj of nb) {
					if (performance.now() - heartBeatStart > FAST_PATH_BUDGET_MS) {
						tele.bailReason = `heartbeat>${FAST_PATH_BUDGET_MS}ms after ${tele.hits + tele.live} objs`;
						wCtx.restore();
						wCtx.restore();
						return false;
					}

					if (obj.visible === false) continue;
					const bm = bitmapManager.getIfCompatible(obj.id, zoom);
					if (bm) {
						tele.hits++;
						const b = bitmapManager.getBounds(obj);
						wCtx.drawImage(
							bm,
							b.left - BITMAP_PADDING,
							b.top - BITMAP_PADDING,
							b.width + BITMAP_PADDING * 2,
							b.height + BITMAP_PADDING * 2,
						);
					} else {
						tele.live++;
						renderWithLOD(obj, wCtx, zoom);
					}
				}
				wCtx.restore();
			}
			wCtx.restore();
			sCtx.clearRect(0, 0, pw, ph);
			sCtx.drawImage(wc as CanvasImageSource, 0, 0);
			return true;
		} catch (err) {
			if (IS_DEV) {
				// eslint-disable-next-line no-console
				console.error("[applyIncrementalPan] threw, falling to chunked:", err);
			}
			tele.bailReason = "threw";
			return false;
		}
	}

	// ─── Small Viewport Fast Path (O(1) scale-blit) ────────────────────────────
	//
	// For small zoom (and zoom+pan) deltas, we DON'T redraw every visible object —
	// we transform the existing stable canvas to match the new viewport via a
	// single drawImage with a composed affine.
	//
	// This is O(1) regardless of object count. The cost: slight blur/aliasing
	// for the duration of the gesture, just like the in-gesture fastBlit.
	// A deferred chunked render produces the sharp version in the background.
	//
	// Math: stable canvas content was drawn at lastRenderState.vpt = (s_old, t_old)
	// with an extra dpr scale. To remap onto a working canvas representing
	// newVpt = (s_new, t_new), compose:
	//   out_pixel = (s_new / s_old) * in_pixel + dpr * (t_new - (s_new/s_old) * t_old)
	function applySmallViewport(
		canvas: Canvas,
		newVpt: number[],
		_objects: FabricObject[],
		dpr: number,
		_zoom: number,
		tele: {
			hits: number;
			live: number;
			bailReason: string;
		},
	): boolean {
		try {
			if (!lastRenderState) {
				tele.bailReason = "no prev render";
				return false;
			}
			const oldVpt = lastRenderState.vpt;
			const s_old = oldVpt[0],
				tx_old = oldVpt[4],
				ty_old = oldVpt[5];
			const s_new = newVpt[0],
				tx_new = newVpt[4],
				ty_new = newVpt[5];
			if (s_old <= 0 || s_new <= 0) {
				tele.bailReason = "bad scale";
				return false;
			}

			const ratio = s_new / s_old;
			const dx = dpr * (tx_new - ratio * tx_old);
			const dy = dpr * (ty_new - ratio * ty_old);

			const pw = canvas.getElement().width,
				ph = canvas.getElement().height,
				bg = canvas.backgroundColor;
			const wc = getWorkingCanvas(pw, ph);
			const wCtx = wc.getContext("2d") as
				| CanvasRenderingContext2D
				| OffscreenCanvasRenderingContext2D;
			const sc = getStableCanvas(pw, ph);

			// Paint background first so any uncovered margins are correct.
			wCtx.setTransform(1, 0, 0, 1, 0, 0);
			wCtx.clearRect(0, 0, pw, ph);
			if (bg) {
				wCtx.fillStyle = bg as string;
				wCtx.fillRect(0, 0, pw, ph);
			}

			// Single transformed blit. Image-smoothing on for soft scale, off would
			// give aliased pixels — for a fast path we want softness.
			wCtx.setTransform(ratio, 0, 0, ratio, dx, dy);
			// @ts-ignore  imageSmoothingQuality may not exist on Offscreen ctx
			wCtx.imageSmoothingEnabled = true;
			wCtx.drawImage(sc as CanvasImageSource, 0, 0);

			// Commit working → stable.
			wCtx.setTransform(1, 0, 0, 1, 0, 0);
			const sCtx = sc.getContext("2d") as
				| CanvasRenderingContext2D
				| OffscreenCanvasRenderingContext2D;
			sCtx.clearRect(0, 0, sc.width, sc.height);
			sCtx.drawImage(wc as CanvasImageSource, 0, 0);

			// No telemetry of hits/live for this path — it didn't touch any objects.
			// Mark with a sentinel for logging.
			tele.hits = 0;
			tele.live = 0;
			return true;
		} catch (err) {
			if (IS_DEV) {
				// eslint-disable-next-line no-console
				console.error("[applySmallViewport] threw, falling to chunked:", err);
			}
			tele.bailReason = "threw";
			return false;
		}
	}

	// ─── Deferred Sharp Render ─────────────────────────────────────────────────
	//
	// After a scale-blit fast path, the stable canvas contains soft (scaled)
	// pixels. We schedule a chunked render to replace them with sharp ones,
	// but only after the user has been idle long enough that they're probably
	// not about to gesture again. Tied to gen so it aborts on new gesture.
	let deferredSharpTimer: any = null;

	function scheduleDeferredSharpRender(gen: number) {
		if (deferredSharpTimer) clearTimeout(deferredSharpTimer);
		deferredSharpTimer = setTimeout(() => {
			deferredSharpTimer = null;
			if (gen !== currentGen) return;
			if (useGestureStore().isGesturing) return;
			// Force a chunked render at current vpt. We don't reset lastRenderState
			// because the visible objects are correct — we just want sharp pixels.
			// Setting lastRenderState to null forces analyzeViewportChange → 'full'.
			lastRenderState = null;
			updateVisibility(false);
		}, 120);
	}

	// ─── Post-Gesture Baking ───────────────────────────────────────────────────
	//
	// Baking is now tied to BOTH a generation number AND a dedicated bake
	// controller. The controller is the one we abort on gesture start. The gen
	// check is the cheaper inline check used inside the loops.
	//
	// Adaptive cap: instead of a fixed MAX_BAKES_PER_GESTURE, we scale by the
	// visible object count. With 2284 objects visible there's no point trying
	// to bake all of them — the next zoom will invalidate the bucket anyway.
	// We aim to bake at most ~40% of visible objects per gesture on desktop,
	// ~25% on mobile, and respect an absolute ceiling.
	function adaptiveBakeCap(visibleCount: number): number {
		const fraction = IS_LOW_END ? 0.15 : IS_MOBILE ? 0.25 : 0.4;
		const computed = Math.ceil(visibleCount * fraction);
		return Math.min(computed, MAX_BAKES_PER_GESTURE);
	}

	function schedulePostGestureBake(
		objects: FabricObject[],
		zoom: number,
		gen: number,
		liveCount: number = 0,
	) {
		if (useGestureStore().isGesturing) return;
		if (gen !== currentGen) return;
		if (objects.length === 0) return;

		// Abort any previous bake schedule and start fresh.
		currentBakeController?.abort();
		const ctrl = new AbortController();
		currentBakeController = ctrl;

		const candidates: { obj: FabricObject; cost: number }[] = [];
		for (const obj of objects) {
			if (!bitmapManager.shouldCache(obj)) continue;
			if (bitmapManager.getIfFreshEnough(obj.id, zoom)) continue;
			const o = obj as any;
			const cost = o.compressedTrace?.length ?? o.path?.length ?? 0;
			candidates.push({ obj, cost });
		}

		if (candidates.length === 0) {
			if (currentBakeController === ctrl) currentBakeController = null;
			return;
		}

		candidates.sort((a, b) => b.cost - a.cost);
		const cap = Math.min(candidates.length, adaptiveBakeCap(objects.length));
		const queue = candidates.slice(0, cap).map((c) => c.obj);

		if (IS_DEV) {
			// eslint-disable-next-line no-console
			console.debug(
				`[bake] scheduled ${queue.length}/${candidates.length} (visible=${objects.length}, cap=${cap})`,
			);
		}

		const run = () => {
			if (ctrl.signal.aborted || gen !== currentGen) return;
			bakeQueue(queue, zoom, ctrl, gen);
		};
		typeof window.requestIdleCallback === "function"
			? window.requestIdleCallback(run, { timeout: 3000 })
			: setTimeout(run, 150);
	}

	async function bakeQueue(
		queue: FabricObject[],
		zoom: number,
		ctrl: AbortController,
		gen: number,
	) {
		const gs = useGestureStore();
		const BATCH_FLUSH_MS = 250;
		const state = { batch: [] as FabricObject[], lastFlush: performance.now() };

		const shouldStop = () =>
			ctrl.signal.aborted || gs.isGesturing || gen !== currentGen;

		const flush = () => {
			if (state.batch.length > 0 && !shouldStop()) {
				scheduleInvalidation(state.batch);
			}
			state.batch = [];
			state.lastFlush = performance.now();
		};

		const cleanup = () => {
			state.batch = [];
			if (currentBakeController === ctrl) currentBakeController = null;
		};

		let i = 0;
		while (i < queue.length) {
			if (shouldStop()) {
				cleanup();
				return;
			}

			const frameStart = performance.now();
			while (
				i < queue.length &&
				performance.now() - frameStart < BAKE_FRAME_BUDGET_MS
			) {
				if (shouldStop()) {
					cleanup();
					return;
				}

				const obj = queue[i++];
				const did = await bitmapManager.bake(obj, zoom, ctrl.signal);

				// Critical: re-check IMMEDIATELY after await. The bake might have
				// completed normally but during the await a new gesture may have
				// started, in which case any further work is pure waste.
				if (shouldStop()) {
					cleanup();
					return;
				}
				if (did) state.batch.push(obj);
				if (performance.now() - state.lastFlush > BATCH_FLUSH_MS) flush();
			}

			if (i < queue.length) {
				await new Promise<void>((r) => requestAnimationFrame(() => r()));
				if (shouldStop()) {
					cleanup();
					return;
				}
			}
		}
		flush();

		if (currentBakeController === ctrl) currentBakeController = null;
	}

	// ─── Surgical Patch Pipeline ───────────────────────────────────────────────
	const dirtyObjects = new Set<FabricObject>();
	const dirtyRects = new Set<Rect>();
	let isBatchScheduled = false;

	function scheduleInvalidation(t: FabricObject | FabricObject[]) {
		(Array.isArray(t) ? t : [t]).forEach((o) => dirtyObjects.add(o));
		triggerBatch();
	}

	function scheduleRectInvalidation(r: Rect) {
		dirtyRects.add(r);
		triggerBatch();
	}

	function triggerBatch() {
		if (isBatchScheduled) return;
		isBatchScheduled = true;
		queueMicrotask(() => {
			isBatchScheduled = false;
			const gs = useGestureStore();
			if (gs.isGesturing || pendingFullRerender) return;
			if (isChunkedRenderRunning) {
				pendingBatchAfterRender = true;
				return;
			}
			flushDirtyBatch();
		});
	}

	function flushDirtyBatch(force = false) {
		if (dirtyObjects.size === 0 && dirtyRects.size === 0) return;
		const gs = useGestureStore();
		if (!force && gs.isGesturing) return;
		if (force && (isChunkedRenderRunning || pendingFullRerender)) {
			pendingBatchAfterRender = true;
			return;
		}
		const bObjs = Array.from(dirtyObjects),
			bRects = Array.from(dirtyRects);
		dirtyObjects.clear();
		dirtyRects.clear();
		const clusters = clusterRectsAndObjects(c!, bObjs, bRects);
		for (const cluster of clusters)
			invalidateRegion(c!, cluster.objects, cluster.rects);
		commitToMainScreen(c!);
	}

	interface Cluster {
		bounds: { x: number; y: number; w: number; h: number };
		area: number;
		objects: FabricObject[];
		rects: Rect[];
	}

	function clusterRectsAndObjects(
		canvas: Canvas,
		objects: FabricObject[],
		rects: Rect[],
	): Cluster[] {
		if (objects.length + rects.length <= 4) {
			return [{ bounds: { x: 0, y: 0, w: 0, h: 0 }, area: 0, objects, rects }];
		}
		const clusters: Cluster[] = [];
		for (const r of rects) {
			clusters.push({
				bounds: { x: r.x, y: r.y, w: r.w, h: r.h },
				area: r.w * r.h,
				objects: [],
				rects: [r],
			});
		}
		for (const obj of objects) {
			// @ts-ignore
			const b = obj.getBoundingRect(true, true);
			clusters.push({
				bounds: { x: b.left, y: b.top, w: b.width, h: b.height },
				area: b.width * b.height,
				objects: [obj],
				rects: [],
			});
		}
		const WASTE_THRESHOLD = 2.0;
		let merged = true;
		while (merged && clusters.length > 1) {
			merged = false;
			outer: for (let i = 0; i < clusters.length; i++) {
				for (let j = i + 1; j < clusters.length; j++) {
					const a = clusters[i],
						b = clusters[j];
					const minX = Math.min(a.bounds.x, b.bounds.x),
						minY = Math.min(a.bounds.y, b.bounds.y);
					const maxX = Math.max(
						a.bounds.x + a.bounds.w,
						b.bounds.x + b.bounds.w,
					);
					const maxY = Math.max(
						a.bounds.y + a.bounds.h,
						b.bounds.y + b.bounds.h,
					);
					const unionArea = (maxX - minX) * (maxY - minY);
					if (unionArea <= (a.area + b.area) * WASTE_THRESHOLD) {
						a.bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
						a.area = unionArea;
						a.objects.push(...b.objects);
						a.rects.push(...b.rects);
						clusters.splice(j, 1);
						merged = true;
						break outer;
					}
				}
			}
		}
		return clusters;
	}

	function flushPendingBatch() {
		if (!pendingBatchAfterRender) return;
		pendingBatchAfterRender = false;
		flushDirtyBatch();
	}

	// ─── Quadtree ──────────────────────────────────────────────────────────────
	function addToQuadTree(obj: FabricObject) {
		const e = fabricObjectToEntry(obj);
		entryMap.set(obj.id, e);
		quadtree.insert(e);
	}

	function removeFromQuadTree(obj: FabricObject) {
		const e = entryMap.get(obj.id);
		if (e) {
			quadtree.remove(e);
			entryMap.delete(obj.id);
		}
	}

	function updateQuadTree(obj: FabricObject) {
		const e = entryMap.get(obj.id);
		if (!e) return;
		const b = obj.getBoundingRect(true, true);
		e.bounds.x = b.left;
		e.bounds.y = b.top;
		e.bounds.w = b.width;
		e.bounds.h = b.height;
		quadtree.update(e);
	}

	function getVisibleObjects(): FabricObject[] {
		return quadtree
			.query(getViewportRect(c!))
			.map((i) => objectMap.get(i.id))
			.filter(Boolean) as FabricObject[];
	}

	function query(rect: Rect): FabricObject[] {
		return quadtree
			.query(rect)
			.map((i) => objectMap.get(i.id))
			.filter(Boolean) as FabricObject[];
	}

	// ─── Viewport Tests ────────────────────────────────────────────────────────
	function isObjectInViewport(canvas: Canvas, obj: FabricObject): boolean {
		const v = getViewportRect(canvas);
		// @ts-ignore
		const b = obj.getBoundingRect(true, true);
		return !(
			b.left > v.x + v.w ||
			b.left + b.width < v.x ||
			b.top > v.y + v.h ||
			b.top + b.height < v.y
		);
	}

	function isRectInViewport(canvas: Canvas, r: Rect): boolean {
		const v = getViewportRect(canvas);
		return !(
			r.x > v.x + v.w ||
			r.x + r.w < v.x ||
			r.y > v.y + v.h ||
			r.y + r.h < v.y
		);
	}

	// ─── Surgical Region Invalidation ──────────────────────────────────────────
	function invalidateRegion(
		canvas: Canvas,
		objects: FabricObject[],
		rects: Rect[] = [],
	) {
		const stVpt = lastRenderState?.vpt ?? useGestureStore().renderedVpt;
		let mnX = Infinity,
			mnY = Infinity,
			mxX = -Infinity,
			mxY = -Infinity,
			any = false;
		for (const r of rects) {
			if (!isRectInViewport(canvas, r)) continue;
			any = true;
			mnX = Math.min(mnX, r.x);
			mxX = Math.max(mxX, r.x + r.w);
			mnY = Math.min(mnY, r.y);
			mxY = Math.max(mxY, r.y + r.h);
		}
		for (const obj of objects) {
			updateQuadTree(obj);
			if (!isObjectInViewport(canvas, obj)) continue;
			any = true;
			// @ts-ignore
			const b = obj.getBoundingRect(true, true);
			mnX = Math.min(mnX, b.left);
			mxX = Math.max(mxX, b.left + b.width);
			mnY = Math.min(mnY, b.top);
			mxY = Math.max(mxY, b.top + b.height);
		}
		if (!any) return;

		// 1. Calculate boundaries
		const pad = 10;
		let x = mnX - pad;
		let y = mnY - pad;
		let w = mxX - mnX + pad * 2;
		let h = mxY - mnY + pad * 2;

		x = Math.floor(x) - 1;
		y = Math.floor(y) - 1;
		w = Math.ceil(w) + 1;
		h = Math.ceil(h) + 1;

		const pw = canvas.getElement().width,
			ph = canvas.getElement().height;
		const sc = getStableCanvas(pw, ph),
			sCtx = sc.getContext("2d")!;
		const dpr = getDpr(),
			zoom = stVpt[0],
			scale = zoom,
			slop = 2 / scale;

		sCtx.save();
		sCtx.setTransform(1, 0, 0, 1, 0, 0);
		sCtx.scale(dpr, dpr);
		sCtx.transform(stVpt[0], stVpt[1], stVpt[2], stVpt[3], stVpt[4], stVpt[5]);

		// 3. Clear and fill the snapped integers
		sCtx.clearRect(x, y, w, h);
		if (canvas.backgroundColor) {
			sCtx.fillStyle = canvas.backgroundColor as string;
			sCtx.fillRect(x, y, w, h);
		}

		sCtx.beginPath();
		// 4. Clip using the slop factor
		sCtx.rect(x - slop, y - slop, w + slop * 2, h + slop * 2);
		sCtx.clip();
		const nb = query(new Rect(x, y, w, h)),
			zSnap = new Map(getZIndexMap());
		nb.sort((a, b) => (zSnap.get(a) ?? 0) - (zSnap.get(b) ?? 0));
		for (const obj of nb) {
			if (obj.visible === false) continue;
			const bm = bitmapManager.getIfCompatible(obj.id, zoom);
			if (bm) {
				const b = bitmapManager.getBounds(obj);
				sCtx.drawImage(
					bm,
					b.left - BITMAP_PADDING,
					b.top - BITMAP_PADDING,
					b.width + BITMAP_PADDING * 2,
					b.height + BITMAP_PADDING * 2,
				);
			} else {
				renderWithLOD(obj, sCtx as CanvasRenderingContext2D, zoom);
			}
		}
		sCtx.restore();
	}

	// ─── DOM Blit ──────────────────────────────────────────────────────────────
	function commitToMainScreen(canvas: Canvas) {
		const gs = useGestureStore();
		if (gs.isGesturing || pendingFullRerender) return;
		const mainCtx = canvas.getContext(),
			pw = canvas.getElement().width,
			ph = canvas.getElement().height;
		const sc = getStableCanvas(pw, ph),
			dpr = getDpr();
		mainCtx.save();
		mainCtx.setTransform(1, 0, 0, 1, 0, 0);
		mainCtx.scale(dpr, dpr);
		mainCtx.clearRect(0, 0, canvas.width!, canvas.height!);
		mainCtx.drawImage(
			sc as CanvasImageSource,
			0,
			0,
			pw,
			ph,
			0,
			0,
			canvas.width!,
			canvas.height!,
		);
		mainCtx.restore();
		// @ts-ignore
		if (!canvas.skipControlsDrawing) canvas.drawControls(mainCtx);
		// canvas.fire('after:render', { ctx: mainCtx })
	}

	// ─── Gesture Coordination ──────────────────────────────────────────────────
	//
	// These two functions are the canonical entry points for cancellation.
	// onGestureStart() is the BIG hammer: bump generation, kill renders, kill
	// bakes. Anything in flight will see it's stale on its next check.
	function onGestureEnd() {
		pendingFullRerender = true;
		isBatchScheduled = false;
		if (!isChunkedRenderRunning) pendingBatchAfterRender = false;
	}

	function onGestureStart() {
		pendingFullRerender = false;
		pendingBatchAfterRender = false;
		// Bump generation BEFORE aborting controllers — so any code that checks
		// `isStale(gen, sig)` after the abort sees the gen mismatch even if
		// signal propagation is delayed.
		bumpGen();
		killAllInFlight();
		// Cancel any pending deferred sharp render — gesture takes priority.
		if (deferredSharpTimer) {
			clearTimeout(deferredSharpTimer);
			deferredSharpTimer = null;
		}
		isChunkedRenderRunning = false;
	}

	function abortCurrentRender() {
		bumpGen();
		killAllInFlight();
		if (deferredSharpTimer) {
			clearTimeout(deferredSharpTimer);
			deferredSharpTimer = null;
		}
		isChunkedRenderRunning = false;
	}

	// ─── Z-Index ───────────────────────────────────────────────────────────────
	function invalidateZIndex() {
		isZIndexDirty = true;
	}

	function getZIndexMap(): Map<FabricObject, number> {
		if (isZIndexDirty) {
			zIndexMap.clear();
			c!.getObjects().forEach((o, i) => zIndexMap.set(o, i));
			isZIndexDirty = false;
		}
		return zIndexMap;
	}

	// ─── Utils ─────────────────────────────────────────────────────────────────
	function getDpr() {
		return c
			? c.getRetinaScaling
				? c.getRetinaScaling()
				: window.devicePixelRatio || 1
			: window.devicePixelRatio || 1;
	}

	function logRender(
		type: string,
		t0: number,
		tele: { hits: number; live: number },
		total: number,
	) {
		if (!IS_DEV) return;
		const n = tele.hits + tele.live,
			pct = n > 0 ? ((tele.hits / n) * 100).toFixed(1) : "0";
		const v = bitmapManager.getVitals();
		// eslint-disable-next-line no-console
		console.table({
			Type: type,
			ms: (performance.now() - t0).toFixed(1),
			Objects: total,
			Hits: tele.hits,
			Live: tele.live,
			"Hit%": `${pct}%`,
			Cached: v.cachedObjects,
			RAM: `${v.memoryMB}/${v.hardLimitMB} MB`,
		});
	}

	// ─── Misc ──────────────────────────────────────────────────────────────────
	function purgeBlockedObjects() {
		const blocked = useAuthStore().user?.blocked_users ?? [];
		if (!blocked.length) return;
		const rm: FabricObject[] = [];
		objectMap.forEach((o) => {
			if (blocked.includes(o.userId)) rm.push(o);
		});
		if (!rm.length) return;
		rm.forEach((obj) => {
			if (obj.id) {
				bitmapManager.invalidate(obj.id);
				objectMap.delete(obj.id);
				removeFromQuadTree(obj);
			}
			c?.remove(obj);
		});
		updateVisibility(true);
	}

	function setPendingFullRerender(v: boolean) {
		pendingFullRerender = v;
	}

	return {
		init,
		getObjectsById,
		getObjectById,
		updateVisibility,
		updateQuadTree,
		getVisibleObjects,
		query,
		getStableCanvas: (w: number, h: number) => getStableCanvas(w, h),
		onGestureEnd,
		onGestureStart,
		abortCurrentRender,
		flushDirtyBatch,
		purgeBlockedObjects,
		getZIndexMap,
		setPendingFullRerender,
	};
});
