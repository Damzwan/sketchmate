import type { Canvas, FabricObject, Path } from "fabric";
import { defineStore } from "pinia";
import { v4 } from "uuid";
import { type Ref, ref, watch } from "vue";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { compareRenderOrder } from "@/draw/layers/layerRegistry";
import { objectMutationRevision } from "@/draw/objects/objectSerialization";
import {
	bakeryBeginSceneBatch,
	bakeryEndSceneBatch,
} from "@/draw/rendering/bakery/tileBakeryClient";
import { recordPhase } from "@/draw/rendering/renderMetrics";
import { createYielder, yieldToMain } from "@/draw/scheduling/yielder";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { updateFreeDrawingCursor } from "@/draw/tools/cursor";
import { isEraseProtected, isEraseTarget } from "@/draw/tools/erasePolicy";
import { analyzeErasureInWorker } from "@/draw/tools/erasureAnalysisClient";
import { EraserSize, type ToolService } from "@/draw/tools/tool.types";
import { isActive as transformSessionActive } from "@/draw/transform/transformController";
import { CustomEraserBrush } from "@/draw/utils/brushes/CustomEraserBrush";
import { isMobile } from "@/helper/platform.helper";
import { useAuthStore } from "@/store/auth.store";

interface Eraser extends ToolService {
	eraserSize: Ref<number>;
	cancelErase: () => void;
	commitProgrammaticErase: (
		path: Path,
		targets: FabricObject[],
	) => Promise<void>;
	releaseProgrammaticEraser: () => void;
	/** Abandon the deferred fully-erased sweep for a stroke (called by erase undo). */
	cancelErasedCheck: (strokeId: string) => void;
	/** Installed by the history store: "is this erase still undoable?". The sweep
	 *  refuses to delete anything no history entry could restore. */
	setErasureDeletionGuard: (fn: (strokeId: string) => boolean) => void;
	/** Resolves once no erase commit is mid-flight (see erasingSettled). */
	whenErasingSettled: () => Promise<void>;
}

interface CleanupJob {
	targets: Array<{ object: FabricObject; revision: number }>;
	cursor: number;
	deleted: Array<{ object: FabricObject; json: any; revision: number }>;
	path: Path;
}

const IS_MOBILE = isMobile();

export const useEraser = defineStore("eraser", (): Eraser => {
	let c: Canvas | undefined;
	const objMgr = useDrawObjectManager();

	const eraserSize = ref<EraserSize>(EraserSize.small);
	let isCancelling = false;
	let cancelCircle = false;
	let pointerEraseActive = false;
	// One brush per canvas, reused across tool selections. Each brush owns a
	// full-screen retina effect canvas; constructing a fresh one per select()
	// stacked those canvases until GC — real memory pressure on iOS.
	let brush: CustomEraserBrush | null = null;
	let programmaticBrush: CustomEraserBrush | null = null;

	const cleanupQueue: CleanupJob[] = [];
	let draining = false;

	/**
	 * "Can an undo still restore what this stroke's sweep wants to delete?"
	 * Installed by the history store at init (it imports us, so we must not
	 * import it back). Absent → no guard, i.e. the pre-existing behaviour.
	 */
	let erasureDeletionGuard: ((strokeId: string) => boolean) | null = null;

	function setErasureDeletionGuard(fn: (strokeId: string) => boolean) {
		erasureDeletionGuard = fn;
	}

	// ─── erase-commit barrier ───────────────────────────────────────────────
	// The brush dispatches "end" SYNCHRONOUSLY and does not await our async
	// handler, which mutates every target's clipPath (`await b.commit(...)`)
	// BEFORE firing `erasing:end` — the event that records the undo entry. So
	// there is a window where the erase is already applied to the objects but no
	// history action exists for it. An undo landing in that window pops the
	// PREVIOUS action, and the late `addToUndoStackWithResetRedo` then wipes the
	// redo entry it just made — leaving the newest stroke applied with nothing
	// able to undo it. The window widens as clip stacks grow, which is why it hit
	// "after quite a few erases, spamming undo right after the last stroke".
	//
	// History ops await this so they can never interleave with a commit.
	let erasingSettled: Promise<void> = Promise.resolve();
	let releaseErasing: (() => void) | null = null;
	let pendingEraseCommits = 0;
	let eraseCommitChain: Promise<void> = Promise.resolve();

	function beginErasingCommit(): void {
		if (releaseErasing) return; // already inside one
		erasingSettled = new Promise<void>((resolve) => {
			releaseErasing = resolve;
		});
	}

	function endErasingCommit(): void {
		releaseErasing?.();
		releaseErasing = null;
	}

	function whenErasingSettled(): Promise<void> {
		return erasingSettled;
	}

	function enqueueEraseCommit(work: () => Promise<void>): Promise<void> {
		if (pendingEraseCommits++ === 0) beginErasingCommit();

		const execute = async () => {
			const startedAt = performance.now();
			try {
				await work();
			} finally {
				recordPhase("eraseCommit", performance.now() - startedAt);
			}
			// A frantic burst contains many individually-small commits. Without a
			// task boundary, their promise continuations form one giant microtask
			// drain and the browser cannot dispatch input or paint between strokes.
			if (pendingEraseCommits > 1) await yieldToMain("erase-commit-queue");
		};
		const run = eraseCommitChain.then(execute, execute);
		eraseCommitChain = run.catch(() => {});
		return run.finally(() => {
			pendingEraseCommits--;
			if (pendingEraseCommits === 0) {
				if (!pointerEraseActive) objMgr.setErasing(false);
				endErasingCommit();
			}
		});
	}

	function objectStillPresent(obj: FabricObject): boolean {
		return !!obj?.id && objMgr.getObjectById(obj.id) === obj;
	}

	function enqueueErasedCheck(targets: FabricObject[], path: Path) {
		if (!targets.length) return;
		cleanupQueue.push({
			targets: targets.map((object) => ({
				object,
				revision: objectMutationRevision(object),
			})),
			cursor: 0,
			deleted: [],
			path,
		});
		scheduleDrain();
	}

	/**
	 * Abandon the deferred "is it fully erased?" pass for a stroke.
	 *
	 * The drain runs in idle time (up to 2s) plus a worker analysis, so it can
	 * still be in flight when the user undoes that erase. If it then deletes
	 * objects, the erase action has already moved to the redo stack, so
	 * `erasing:cleanup_done` finds nothing to record against — the objects are
	 * removed with NO undo entry able to bring them back. Undo calls this first.
	 */
	function cancelErasedCheck(strokeId: string): void {
		if (!strokeId) return;
		for (let i = cleanupQueue.length - 1; i >= 0; i--) {
			if ((cleanupQueue[i].path as any)?.id === strokeId) {
				// In-flight job (index 0 while draining): neutralise it in place so the
				// drain loop finishes without deleting anything.
				cleanupQueue[i].deleted.length = 0;
				cleanupQueue[i].cursor = cleanupQueue[i].targets.length;
				cleanupQueue[i].targets.length = 0;
			}
		}
	}

	/** Start cleanup in idle time so serialization does not compete with a stroke. */
	function scheduleDrain() {
		if (draining) return;
		const ric = (window as any).requestIdleCallback as
			| ((cb: () => void, opts?: { timeout: number }) => number)
			| undefined;
		if (ric) ric(() => void drainCleanup(), { timeout: 2000 });
		else setTimeout(() => void drainCleanup(), 200);
	}

	function idlePause(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, 250));
	}

	async function drainCleanup() {
		if (draining) return;
		draining = true;

		const sweepStartedAt = performance.now();
		const yielder = createYielder({
			budgetMs: 8,
			label: "erase-cleanup",
		});

		try {
			while (cleanupQueue.length > 0) {
				if (!c) {
					cleanupQueue.length = 0;
					return;
				}
				const job = cleanupQueue[0];
				while (job.cursor < job.targets.length) {
					await yielder.maybeYield();
					// A drag/scale session owns the frame budget — back off until it
					// commits so a big-object render can't hitch the interaction.
					while (transformSessionActive()) await idlePause();
					if (!c) {
						cleanupQueue.length = 0;
						return;
					}
					const candidate = job.targets[job.cursor++];
					const obj = candidate.object;
					if (!objectStillPresent(obj)) continue;
					// An older stroke must never analyze the state produced by newer
					// strokes. The newer cleanup job owns that revision and its history.
					if (objectMutationRevision(obj) !== candidate.revision) continue;

					try {
						const dispatchStartedAt = performance.now();
						const result = analyzeErasureInWorker(obj);
						recordPhase(
							"eraseCleanupDispatch",
							performance.now() - dispatchStartedAt,
						);
						const analysis = await result;
						if (
							analysis.fullyErased &&
							analysis.objectRevision === candidate.revision
						) {
							job.deleted.push({
								object: obj,
								json: analysis.objectJSON,
								revision: analysis.objectRevision,
							});
						}
					} catch {
						// Never delete on uncertainty.
					}
				}
				cleanupQueue.shift();
				finalizeCleanup(job);
			}
		} finally {
			draining = false;
			recordPhase("erasedSweep", performance.now() - sweepStartedAt);
			if (cleanupQueue.length > 0) scheduleDrain();
		}
	}

	function finalizeCleanup(job: CleanupJob) {
		if (!c) return;
		const finalizeStartedAt = performance.now();
		const strokeId = (job.path as any).id;

		// NEVER delete something no history entry can bring back.
		//
		// The sweep is deferred, so by the time it lands the erase action may have
		// been trimmed out of history entirely. `erasing:cleanup_done` then finds
		// no action to record the deletion on and drops it — the objects are gone
		// from the canvas with nothing able to restore them. That is a permanent
		// hole in the drawing, and it is exactly what a long erase + undo session
		// produces. Keeping a fully-erased object costs a little memory and no
		// pixels (it renders to nothing), which is strictly the better failure.
		if (erasureDeletionGuard && !erasureDeletionGuard(strokeId)) return;
		const removable = job.deleted.filter(({ object, revision }) => {
			if (!objectStillPresent(object)) return false;
			// The worker JSON is also the future undo snapshot. If the object
			// changed while earlier candidates were being analysed, keep it on the
			// canvas; a later erase sweep can safely reconsider the newer state.
			if (objectMutationRevision(object) !== revision) return false;
			// The check runs deferred — an undo may have pulled this stroke out of
			// the object's clip in the meantime. Deleting then would vanish a
			// visible object with no history action able to restore it.
			const clip: any = object.clipPath;
			return !!clip?._objects?.some((o: any) => o?.id === strokeId);
		});
		if (!removable.length) {
			recordPhase(
				"eraseCleanupFinalize",
				performance.now() - finalizeStartedAt,
			);
			return;
		}
		const removableObjects = removable.map(({ object }) => object);

		// Record stack positions BEFORE removing anything, so erase-undo can
		// restore each object at its original z instead of dropping it on top.
		// All indexes are captured against the same full stack, so ascending
		// re-insertion reproduces them exactly.
		const stack = c.getObjects();
		for (const record of removable) {
			const index = stack.indexOf(record.object);
			(record.object as any).insertedIndex = index;
			record.json.insertedIndex = index;
		}

		// BATCHED. Each `c.remove` fires object:removed → a destructive
		// invalidation: a synchronous tile repair AND an overview patch, per
		// object. A heavy erase fully consumes hundreds of objects, and the sweep
		// deleted them one at a time — measured as 621 sync repairs (3.6 s) and
		// 637 overview patches (2.2 s) in one 18 s session, dwarfing everything
		// the erase itself cost. One batch → one repair pass for the whole sweep.
		const mgr = useDrawObjectManager();
		// Also a MUTATION window: removing objects one at a time is a multi-step
		// scene change, and a bake landing inside it stores a tile that is missing
		// some deletions and not others — permanently, since the tile is fresh.
		mgr.setMutating(true);
		mgr.beginBatch();
		try {
			c.remove(...removableObjects);
		} finally {
			// Close the mutation BEFORE flushing: `mutating` makes the engine skip
			// synchronous repair, and the flush is the settled point where it has to
			// run — otherwise the swept region shows a coarse fallback until the
			// async bake lands. Same ordering rule as closeHistoryBurst.
			mgr.setMutating(false);
			mgr.endBatch();
		}

		c.fire("erasing:cleanup_done", {
			strokeId,
			deletedObjects: removableObjects,
			deletedObjectsJSON: removable.map(({ json }) => json),
		} as any);
		recordPhase("eraseCleanupFinalize", performance.now() - finalizeStartedAt);
	}

	const events: FabricEvent[] = [
		{
			on: "zoomChanged",
			handler: updateEraserCursor,
		},
		{
			on: "mouse:move",
			handler: (e: any) => {
				if (!IS_MOBILE || cancelCircle) return;

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
			handler: (_e: any) => {
				updateEraserCursor();
			},
		},
		{
			on: "gestureStart",
			handler: (_e: any) => {
				cancelCircle = true;
			},
		},
		{
			on: "mouse:up",
			handler: (_e: any) => {
				cancelCircle = false;
				// Backstop: guarantee compositing resumes even if a stroke was
				// cancelled or 'start' was prevented (so the flag can't stick).
				//
				// BUT NOT while a commit is in flight. The brush's onMouseUp fires
				// 'end' → beginErasingCommit (setting releaseErasing) SYNCHRONOUSLY,
				// before fabric fires this 'mouse:up', so releaseErasing is already set
				// here for a real stroke. Resuming now would composite the un-stamped
				// tiles for a frame (the flash) — handleEraseEnd resumes after stamping.
				if (!releaseErasing) objMgr.setErasing(false);
			},
		},
	];

	function init(canvas: Canvas) {
		// Fresh canvas → the old brush (and its full-screen effect canvas) is
		// dead weight. Release it now instead of holding it until next select().
		if (brush && brush.canvas !== canvas) {
			brush.dispose();
			brush = null;
		}
		if (programmaticBrush && programmaticBrush.canvas !== canvas) {
			programmaticBrush.dispose();
			programmaticBrush = null;
		}
		c = canvas;
	}

	function destroy() {
		cleanupQueue.length = 0;
		erasureDeletionGuard = null;
		pointerEraseActive = false;
		cancelCircle = false;
		brush?.dispose();
		programmaticBrush?.dispose();
		brush = null;
		programmaticBrush = null;
		c = undefined;
		objMgr.setErasing(false);
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
		pointerEraseActive = false;
		// The selected tool may have replaced freeDrawingBrush with a pen, crayon,
		// or another Fabric brush. Only CustomEraserBrush owns cancel().
		const brush = c.freeDrawingBrush as Partial<CustomEraserBrush> | undefined;
		if (typeof brush?.cancel === "function") brush.cancel();
		if (pendingEraseCommits === 0) objMgr.setErasing(false);
	}

	async function applyErase(
		activeBrush: CustomEraserBrush,
		detail: {
			path: Path;
			targets: FabricObject[];
			dirtyRect?: { x: number; y: number; w: number; h: number };
		},
		checkForDeletedObjects: boolean,
	): Promise<void> {
		detail.path.id ||= v4();

		const { isPublicLobby } = useDrawSyncer();
		if (isPublicLobby) {
			const { user } = useAuthStore();
			detail.targets = detail.targets.filter(
				(object) => object.userId === user?._id,
			);
		}

		const claim = useClaimArea();
		const touchesForeignArea =
			claim.foreignAreas.length > 0 &&
			claim.objectIntersectsForeignArea(detail.path);
		if (claim.foreignAreas.length > 0) {
			detail.targets = detail.targets.filter(
				(object) => !claim.isObjectProtected(object),
			);
		}
		if (touchesForeignArea) claim.notifyBlocked();

		await activeBrush.commit(detail);

		const eventDetail = {
			...detail,
			deletedObjects: [],
			selective: isPublicLobby || touchesForeignArea,
		};
		bakeryBeginSceneBatch();
		try {
			c!.fire("erasing:end", { detail: eventDetail } as any);
		} finally {
			bakeryEndSceneBatch();
		}

		if (checkForDeletedObjects) {
			enqueueErasedCheck(detail.targets, detail.path);
		}
	}

	async function commitProgrammaticErase(
		path: Path,
		targets: FabricObject[],
	): Promise<void> {
		if (!c) throw new Error("Eraser has not been initialized");

		if (!programmaticBrush || programmaticBrush.canvas !== c) {
			programmaticBrush?.dispose();
			programmaticBrush = new CustomEraserBrush(c);
		}
		// Captured before enqueueing: the commit below runs later, and the store
		// level `programmaticBrush` can be disposed or replaced in the meantime.
		// Named distinctly from the pointer-erase `brush` declared above.
		const committingBrush = programmaticBrush;
		const bounds = path.getBoundingRect();
		const pad = (path.strokeWidth ?? 0) * 1.5;

		objMgr.setErasing(true);
		await enqueueEraseCommit(async () => {
			await applyErase(
				committingBrush,
				{
					path,
					targets,
					dirtyRect: {
						x: bounds.left - pad,
						y: bounds.top - pad,
						w: bounds.width + pad * 2,
						h: bounds.height + pad * 2,
					},
				},
				false,
			);
		});
	}

	function releaseProgrammaticEraser(): void {
		programmaticBrush?.dispose();
		programmaticBrush = null;
	}

	/**
	 * Everything that makes a brush instance behave correctly for the CURRENT
	 * scene. Idempotent, so it can be re-applied to a reused brush.
	 */
	function attachProviders(b: CustomEraserBrush): void {
		// The live mask is built from PROTECTED objects only.
		//
		// It used to receive every visible object and rely on `draw()` dimming the
		// erasable ones away. That works, but it makes the mask's correctness
		// depend on a second predicate agreeing with this one — and when they
		// disagreed, other layers visibly vanished under the pointer and came back
		// on release. Handing over only what must survive the stroke removes the
		// disagreement, and renders strictly fewer objects per mask build.
		//
		// Still viewport-scoped: an off-screen object cannot contribute a pixel to
		// a screen-space mask.
		b.protectObjectsProvider = () => {
			const objects = objMgr.getVisibleObjects().filter(isEraseProtected);
			objMgr.getZIndexMap();
			return objects.sort(compareRenderOrder);
		};

		// Commit side of the same rule. `walk()` still runs the precise
		// intersection test, so a padded over-query is safe.
		b.erasableFilter = isEraseTarget;
		b.isEraseStrokeUndoable = (strokeId: string) =>
			erasureDeletionGuard?.(strokeId) ?? true;
		b.targetCandidatesProvider = (path: Path) => {
			const r = (path as any).getBoundingRect();
			const pad = (path as any).strokeWidth ?? 0;
			return objMgr.querySelectable({
				x: r.left - pad,
				y: r.top - pad,
				w: r.width + 2 * pad,
				h: r.height + 2 * pad,
			});
		};
	}

	async function select() {
		c!.isDrawingMode = true;
		c!.selection = false;
		c!.skipTargetFind = true;

		if (brush && brush.canvas === c) {
			// Reuse: handlers are already attached. Only the dims may be stale
			// (rotation / keyboard resize since last use).
			brush.syncDimensions();
			brush.width = eraserSize.value;
			// Re-attach the providers rather than trusting what a long-lived brush
			// happens to carry. A brush instance outlives tool selections and dev
			// hot-reloads, and a brush missing one of these fails SILENTLY — it
			// simply erases more than it should.
			attachProviders(brush);
			c!.freeDrawingBrush = brush;
			updateEraserCursor();
			return;
		}

		brush?.dispose(); // canvas changed — release the old effect canvas now
		const b = new CustomEraserBrush(c!);
		brush = b;

		b.width = eraserSize.value;
		attachProviders(b);

		// Stroke begins: the brush now owns the canvas's lower context (it
		// post-composites destination-out after each render). Suspend the tile
		// compositor for the stroke so the two don't race and flicker.
		b.on("start", () => {
			pointerEraseActive = true;
			objMgr.setErasing(true);
		});

		// Stroke ended without a usable path (<2 points): resume immediately.
		b.on("cancel", () => {
			pointerEraseActive = false;
			if (pendingEraseCommits === 0) objMgr.setErasing(false);
		});

		b.on("end", (e: any) => {
			pointerEraseActive = false;
			// Hold history ops off until the clip mutation AND its undo entry both
			// exist — the brush fires "end" synchronously and never awaits us, so
			// without this an undo can land between them (see beginErasingCommit).
			void enqueueEraseCommit(() => handleEraseEnd(e)).catch((error) => {
				console.error("[Eraser] stroke commit failed", error);
			});
		});

		const handleEraseEnd = async (e: any) => {
			// Keep the compositor SUSPENDED through the commit + stamp. The brush's
			// destination-out result is on the lower context, so the screen shows the
			// correct erased state meanwhile. We resume (→ one composite of the now-
			// STAMPED tiles) only in the finally. Resuming first — as before — let a
			// composite paint the still-un-stamped tiles for a frame: the flash. The
			// mouse:up backstop is gated on the in-flight commit so it can't resume
			// early either.
			e.detail.path.id = v4();

			if (isCancelling) {
				isCancelling = false;
				await b.commit(e.detail);
				return;
			}
			await applyErase(b, e.detail, true);
		};

		b.on("redraw", (e: any) => {
			// The initial drawEffect on mousedown already produced the mask.
			// We don't need to redo it after every render.
			if (e.detail.type === "render") e.preventDefault();
		});

		c!.freeDrawingBrush = b;
		updateEraserCursor();
	}

	watch(eraserSize, () => {
		if (!c?.freeDrawingBrush) return;
		c.freeDrawingBrush.width = eraserSize.value;
		updateEraserCursor();
	});

	return {
		init,
		destroy,
		select,
		eraserSize,
		events,
		cancelErase,
		commitProgrammaticErase,
		releaseProgrammaticEraser,
		cancelErasedCheck,
		setErasureDeletionGuard,
		whenErasingSettled,
	};
});
