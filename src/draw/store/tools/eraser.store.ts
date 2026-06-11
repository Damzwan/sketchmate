import { Canvas, FabricObject, Path } from "fabric";
import { ref, type Ref, watch } from "vue";
import { EraserSize, FabricEvent, ToolService } from "@/draw/types/draw.types";
import { defineStore } from "pinia";
import { CustomEraserBrush } from "@/draw/utils/brushes/CustomEraserBrush";
import { isMobile } from "@/helper/general.helper";
import { updateFreeDrawingCursor } from "@/draw/helpers/tools/cursor.helper";
import { v4 } from "uuid";
import { isCompletelyErased } from "@/draw/helpers/tools/eraser.helper";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useAuthStore } from "@/store/auth.store";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";

interface Eraser extends ToolService {
	eraserSize: Ref<number>;
	cancelErase: () => void;
}

// ---------------------------------------------------------------------------
// Idle scheduling helper: requestIdleCallback when available, else a gentle
// setTimeout fallback. The `timeout: 1000` guarantees the queue still drains
// even if the browser never reports an idle window (e.g. continuous erasing).
// ---------------------------------------------------------------------------
interface IdleDeadlineLike {
	timeRemaining(): number;
	didTimeout: boolean;
}

const requestIdle: (cb: (d: IdleDeadlineLike) => void) => void =
	typeof (globalThis as any).requestIdleCallback === "function"
		? (cb) => (globalThis as any).requestIdleCallback(cb, { timeout: 1000 })
		: (cb) =>
				setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: true }), 16);

interface CleanupJob {
	targets: FabricObject[];
	cursor: number;
	deleted: FabricObject[];
	path: FabricObject;
}

export const useEraser = defineStore("eraser", (): Eraser => {
	let c: Canvas | undefined = undefined;
	const objMgr = useDrawObjectManager();

	const eraserSize = ref<EraserSize>(EraserSize.small);
	let isCancelling = false;
	let cancelCircle = false;

	// -----------------------------------------------------------------------
	// Deferred "fully erased" detection
	//
	// isCompletelyErased() renders each candidate to an offscreen canvas and
	// reads back its pixels to decide whether anything survived the erase. That
	// readback forces a GPU->CPU sync + a full pixel scan PER OBJECT. Running it
	// synchronously for every target the instant the stroke ends freezes the
	// main thread proportionally to how many objects the eraser passed over.
	//
	// So: apply the erase + fire `erasing:end` immediately (tiles re-bake, peers
	// get the stroke), then drain the completeness checks during idle time in
	// small time-budgeted slices, removing fully-erased objects as we go.
	//
	// Object-granularity yielding is enough — a single check is bounded (render
	// capped at ~1MP, pixel loop early-exits). We just never run a long run of
	// them back-to-back.
	// -----------------------------------------------------------------------
	const cleanupQueue: CleanupJob[] = [];
	let cleanupScheduled = false;

	function objectStillPresent(obj: FabricObject): boolean {
		return !!obj?.id && objMgr.getObjectById(obj.id) === obj;
	}

	function enqueueErasedCheck(targets: FabricObject[], path: FabricObject) {
		if (!targets.length) return;
		cleanupQueue.push({
			targets: targets.slice(),
			cursor: 0,
			deleted: [],
			path,
		});
		scheduleCleanup();
	}

	function scheduleCleanup() {
		if (cleanupScheduled || cleanupQueue.length === 0) return;
		cleanupScheduled = true;
		requestIdle(drainCleanup);
	}

	function drainCleanup(deadline: IdleDeadlineLike) {
		cleanupScheduled = false;
		if (!c) {
			cleanupQueue.length = 0;
			return;
		}
		const start = performance.now();
		const BUDGET_MS = 4;
		// Always process at least one object per slice (forward progress even
		// under sustained load / didTimeout), then respect the time budget.
		let didOne = false;
		const hasBudget = () =>
			!didOne ||
			(deadline.timeRemaining() > 1 && performance.now() - start < BUDGET_MS);

		while (cleanupQueue.length > 0) {
			const job = cleanupQueue[0];
			while (job.cursor < job.targets.length) {
				if (!hasBudget()) {
					scheduleCleanup();
					return;
				}
				const obj = job.targets[job.cursor++];
				didOne = true;
				// Object may have been removed by a later stroke, an undo, etc.
				if (!objectStillPresent(obj)) continue;
				try {
					if (isCompletelyErased(obj)) job.deleted.push(obj);
				} catch {
					// Never delete on uncertainty — leave the object intact.
				}
			}
			cleanupQueue.shift();
			finalizeCleanup(job);
		}
	}

	function finalizeCleanup(job: CleanupJob) {
		if (!c) return;
		const removable = job.deleted.filter(objectStillPresent);
		if (!removable.length) return;

		for (const obj of removable) {
			c.remove(obj);
		}

		c.fire("erasing:cleanup_done", {
			strokeId: job.path.id,
			deletedObjects: removable,
		} as any);
	}

	const events: FabricEvent[] = [
		{
			on: "zoomChanged",
			handler: updateEraserCursor,
		},
		{
			on: "mouse:move",
			handler: (e: any) => {
				if (!isMobile() || cancelCircle) return;

				const ctx = c!.contextTop;

				c!.clearContext(ctx);

				const pointer = e.viewportPoint;

				ctx.beginPath();
				ctx.arc(
					pointer.x,
					pointer.y,
					(eraserSize.value * c!.getZoom()) / 2,
					0,
					2 * Math.PI,
				);

				ctx.strokeStyle = "lightblue";
				const og = ctx.lineWidth;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.lineWidth = og;
			},
		},
		{
			on: "zoomReset",
			handler: (e: any) => {
				updateEraserCursor();
			},
		},
		{
			on: "gestureStart",
			handler: (e: any) => {
				cancelCircle = true;
			},
		},
		{
			on: "mouse:up",
			handler: (e: any) => {
				cancelCircle = false;
			},
		},
	];

	function init(canvas: Canvas) {
		c = canvas;
	}

	function updateEraserCursor() {
		updateFreeDrawingCursor(
			c!,
			eraserSize.value,
			c!.backgroundColor as string,
			true,
		);
	}

	function cancelErase() {
		if (!c) return;
		const brush = c.freeDrawingBrush as CustomEraserBrush;
		if (!brush) return;
		brush.cancel();
	}

	async function select() {
		c!.isDrawingMode = true;
		c!.selection = false;
		c!.skipTargetFind = true;

		const b = new CustomEraserBrush(c!);

		b.width = eraserSize.value;

		// Restrict the (expensive) selective-erase mask render to on-screen
		// objects, returned in paint (z) order. Off-viewport objects can never
		// contribute a visible pixel to a screen-space mask, so this is correct
		// and avoids a full native re-render of every object on mousedown.
		b.protectObjectsProvider = () => {
			const objs = objMgr.getVisibleObjects();
			const z = objMgr.getZIndexMap();
			return objs.sort((a, b2) => (z.get(a) ?? 0) - (z.get(b2) ?? 0));
		};

		// Resolve eraser targets through the spatial index instead of scanning
		// every object. walk() still runs the precise intersection test, so a
		// padded over-query is safe. Assumes targets are indexed (have ids) —
		// which they are for everything synced through drawObjectManager.
		b.targetCandidatesProvider = (path: Path) => {
			const r = (path as any).getBoundingRect(true, true);
			const pad = (path as any).strokeWidth ?? 0;
			return objMgr.query({
				x: r.left - pad,
				y: r.top - pad,
				w: r.width + 2 * pad,
				h: r.height + 2 * pad,
			});
		};

		b.on("end", async (e: any) => {
			e.detail.path.id = v4();

			if (isCancelling) {
				isCancelling = false;
				await b.commit(e.detail);
				return;
			}

			// 1. FILTER TARGETS FIRST: Remove objects belonging to other users
			const { isPublicLobby } = useDrawSyncer();
			if (isPublicLobby) {
				const { user } = useAuthStore();
				e.detail.targets = (e.detail.targets || []).filter(
					(o: FabricObject) => o.userId === user?._id,
				);
			}

			// 2. COMMIT: apply erasure clip paths to the allowed targets. Must run
			//    before the re-bake so the cached tiles reflect the erase.
			await b.commit(e.detail);

			const targets: FabricObject[] = e.detail.targets || [];

			// 3. Reflect the erase immediately: re-bake affected tiles + let peers
			//    receive the stroke. No pixel readback happens on this path.
			e.detail.deletedObjects = [];
			c!.fire("erasing:end", e as any);

			// 4. Defer the per-object "is it fully gone?" check to idle time so a
			//    large pass doesn't freeze the main thread on pointer-up.
			enqueueErasedCheck(targets, e.detail.path);
		});

		b.on("redraw", (e: any) => {
			// The initial drawEffect on mousedown already produced the mask.
			// We don't need to redo it after every render.
			if (e.detail.type === "render") e.preventDefault();
		});

		c!.freeDrawingBrush = b;
		updateEraserCursor();
	}

	watch(eraserSize, () => {
		c!.freeDrawingBrush!.width = eraserSize.value;
		updateEraserCursor();
	});

	return { init, select, eraserSize, events, cancelErase };
});
