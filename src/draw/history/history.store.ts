import type { Canvas, FabricObject } from "fabric";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { MAX_HISTORY_ACTIONS } from "@/draw/history/eraseUndoPolicy";
import { type HistoryAction, HistoryEvent } from "@/draw/history/history.types";
import {
	type HistoryContext,
	redoActionMapping,
	undoActionMapping,
} from "@/draw/history/historyActions";
import {
	eraseHistoryWeight,
	referenceHistoryWeight,
} from "@/draw/history/historyBudget";
import { getObjectDiff } from "@/draw/history/operations/objectHistory";
import { handleTextModification } from "@/draw/history/operations/textHistory";
import {
	getAbsoluteState,
	serializeOnce,
	toJSON,
	toObjectsIds,
} from "@/draw/objects/objectSerialization";
import { recordPhase } from "@/draw/rendering/renderMetrics";
import { yieldToMain } from "@/draw/scheduling/yielder";
import { useDrawStore } from "@/draw/session/draw.store";
import { useEraser } from "@/draw/tools/eraser.store";
import { useSelect } from "@/draw/tools/select.store";
import { isText } from "@/draw/tools/textEditing";
import * as transform from "@/draw/transform/transformController";
import { EventBus } from "@/main";

export const useDrawHistoryManager = defineStore("history", () => {
	let c: Canvas | undefined;

	let undoStack: HistoryAction[] = [];
	let redoStack: HistoryAction[] = [];

	// instead of reffing the whole undo stack we only provide counters
	const undoStackCounter = ref(0);
	const redoStackCounter = ref(0);

	const undoDisabled = computed(() => undoStackCounter.value === 0);
	const redoDisabled = computed(() => redoStackCounter.value === 0);

	const lastActionType = ref<"normal" | "undo" | "redo">();

	// The count cap alone cannot bound memory: a single action can retain the
	// JSON of hundreds of objects (an erase across a dense region) or of the
	// WHOLE canvas (prevCanvasJSON on a full erase). On a big board that is tens
	// of MB per entry, pinned until 50 more actions push it out. So also cap the
	// total number of serialized objects held across the stack, evicting oldest
	// first — but never below MIN_ACTIONS, so recent undo always works.
	const IS_MOBILE_HISTORY =
		typeof navigator !== "undefined" &&
		/Mobi|Android/i.test(navigator.userAgent);
	const MAX_RETAINED_OBJECTS = IS_MOBILE_HISTORY ? 400 : 1200;
	const MIN_ACTIONS = 5;

	/**
	 * Attach a JSON param that is only serialized if something actually reads it.
	 *
	 * A wide erase can delete hundreds of objects, and `toJSON()` on each ran
	 * SYNCHRONOUSLY in the erase frame just to fill the undo entry — paid on
	 * every erase, but only ever USED if the user undoes. Deleted objects are
	 * off-canvas and never mutate again, so deferring is safe: serializing later
	 * yields the identical JSON.
	 *
	 * NB the property must stay writable — `erasing:cleanup_done` appends to it.
	 * And nothing may enumerate-and-read params casually (see actionWeight),
	 * or the getter fires and the laziness is lost.
	 */
	function defineLazyJSON(
		params: any,
		key: string,
		objects: FabricObject[],
	): void {
		let cached: any[] | null = null;
		let pending: FabricObject[] = objects.slice();
		let pendingSerialized: any[] = [];
		Object.defineProperty(params, key, {
			configurable: true,
			enumerable: true,
			get() {
				if (!cached) cached = [...toJSON(pending), ...pendingSerialized];
				return cached;
			},
			set(v: any[]) {
				cached = v;
				pending = [];
				pendingSerialized = [];
			},
		});
		// Append MORE objects without forcing serialization (erasing:cleanup_done
		// reports late deletions). Reading the param to concat would have
		// serialized the whole pending set right back on the hot path.
		Object.defineProperty(params, `__append_${key}`, {
			configurable: true,
			enumerable: false,
			value: (more: FabricObject[]) => {
				if (cached) cached = [...cached, ...toJSON(more)];
				else pending = [...pending, ...more];
			},
		});
		Object.defineProperty(params, `__append_${key}_serialized`, {
			configurable: true,
			enumerable: false,
			value: (more: any[]) => {
				if (cached) cached = [...cached, ...more];
				else pendingSerialized = [...pendingSerialized, ...more];
			},
		});
	}

	/** Approximate retained-object count for one action; cached on the action. */
	function actionWeight(action: any): number {
		if (typeof action.__w === "number") return action.__w;
		let w = 1;
		const p = action?.params ?? {};
		for (const key of Object.keys(p)) {
			// NEVER read through an accessor. Lazy params (defineLazyJSON)
			// serialize on first read, which is the exact cost they exist to
			// avoid — merely weighing the stack would have forced every deferred
			// erase payload to materialize on the hot path. Actions carrying a
			// lazy param must precompute `__w` (see the Erasing handler); an
			// un-precomputed one is simply under-counted, which is safe.
			const d = Object.getOwnPropertyDescriptor(p, key);
			if (!d || d.get) continue;
			const v = d.value;
			if (Array.isArray(v)) w += v.length;
			else if (v && typeof v === "object" && Array.isArray(v.objects)) {
				w += v.objects.length; // prevCanvasJSON — a whole-canvas snapshot
			}
		}
		action.__w = w;
		return w;
	}

	function stackWeight(stack: HistoryAction[]): number {
		let total = 0;
		for (const a of stack) total += actionWeight(a);
		return total;
	}

	/** Drop oldest entries until `stack` is under `budget` or hits MIN_ACTIONS.
	 *  Returns the weight left. Index 0 is oldest in BOTH stacks (undo and redo
	 *  are both pushed and popped from the tail). */
	function evictOldest(stack: HistoryAction[], budget: number): number {
		let total = stackWeight(stack);
		while (total > budget && stack.length > MIN_ACTIONS) {
			total -= actionWeight(stack[0]);
			stack.shift();
		}
		return total;
	}

	/**
	 * Bound BOTH stacks, by count and by retained objects.
	 *
	 * The redo stack used to be completely uncapped — no count limit, no weight
	 * limit. Every undo moves its action to the redo stack, so undoing N times
	 * on a big board migrated N heavy entries (whole-canvas `prevCanvasJSON`
	 * snapshots, erase `deletedObjectsJSON`) into a container nothing ever
	 * trimmed. Worse, undoing an erase FORCES its lazy payload to materialize,
	 * so what lands in the redo stack is the fully-serialized version. Holding
	 * undo down on a dense canvas was therefore an unbounded main-thread heap
	 * climb — on precisely the low-memory devices already showing
	 * `libwebviewchromium.so` SIGTRAP (a Chromium OOM CHECK).
	 *
	 * The budget is now COMBINED rather than per-stack, so the ceiling doesn't
	 * silently double. Redo is evicted first: the user explicitly undid past
	 * those, so losing the far end of redo is less harmful than losing the undo
	 * they are about to reach for.
	 */
	function trimStacks(): void {
		if (undoStack.length > MAX_HISTORY_ACTIONS) {
			undoStack.splice(0, undoStack.length - MAX_HISTORY_ACTIONS);
		}
		if (redoStack.length > MAX_HISTORY_ACTIONS) {
			redoStack.splice(0, redoStack.length - MAX_HISTORY_ACTIONS);
		}
		const undoTotal = stackWeight(undoStack);
		if (undoTotal + stackWeight(redoStack) <= MAX_RETAINED_OBJECTS) return;
		const redoTotal = evictOldest(
			redoStack,
			Math.max(0, MAX_RETAINED_OBJECTS - undoTotal),
		);
		evictOldest(undoStack, Math.max(0, MAX_RETAINED_OBJECTS - redoTotal));
	}

	const {
		updateQuadTree,
		getObjectById,
		getObjectsById,
		beginBatch,
		endBatch,
	} = useDrawObjectManager();
	const { unSelect } = useSelect();

	const events: FabricEvent[] = [
		{
			on: "erasing:end",
			handler: (e: any) => {
				if (e.detail.targets.length === 0) return;

				const targets = e.detail.targets as FabricObject[];
				const eraserStroke = e.detail.path;

				const deleted = (e.detail.deletedObjects ?? []) as FabricObject[];
				const params: any = {
					objectIds: toObjectsIds(targets),
					strokeJSON: eraserStroke.toJSON(),
					strokeId: eraserStroke.id,
				};
				// Deferred: serializing every deleted object here cost a synchronous
				// toJSON per object in the erase frame, for an entry most users never
				// undo. See defineLazyJSON.
				defineLazyJSON(params, "deletedObjectsJSON", deleted);

				const action: any = { type: HistoryEvent.Erasing, params };
				// Precompute the trim weight so trimStacks never reads the lazy
				// param (which would serialize it and defeat the whole point).
				action.__w = eraseHistoryWeight(targets.length, deleted.length);
				addToUndoStackWithResetRedo(action);
			},
		},
		{
			on: "erasing:cleanup_done",
			handler: (e: any) => {
				const { strokeId, deletedObjects, deletedObjectsJSON } = e;

				// Search BOTH stacks. The cleanup sweep is deferred, so the user may
				// already have undone (or undone+redone) this erase, moving its entry
				// to the redo stack. Scanning only the undo stack dropped the deletion
				// on the floor — the objects were gone with no entry able to restore
				// them, i.e. the erase stayed applied permanently.
				const findErasingAction = (stack: HistoryAction[]) => {
					for (let i = stack.length - 1; i >= 0; i--) {
						const a: any = stack[i];
						if (
							a.type === HistoryEvent.Erasing &&
							a.params.strokeId === strokeId
						) {
							return a;
						}
					}
					return undefined;
				};

				const action: any =
					findErasingAction(undoStack) ?? findErasingAction(redoStack);
				if (!action) return;

				const appendSerialized =
					action.params.__append_deletedObjectsJSON_serialized;
				const appendObjects = action.params.__append_deletedObjectsJSON;
				if (appendSerialized && Array.isArray(deletedObjectsJSON)) {
					// Worker analysis already needed this exact snapshot. Reuse it
					// so the first undo does not serialize every deleted object in
					// one uninterruptible main-thread block.
					appendSerialized(deletedObjectsJSON);
					if (typeof action.__w === "number") {
						action.__w += (deletedObjects as FabricObject[]).length;
					}
				} else if (appendObjects) {
					appendObjects(deletedObjects as FabricObject[]);
					if (typeof action.__w === "number") {
						action.__w += (deletedObjects as FabricObject[]).length;
					}
				} else {
					action.params.deletedObjectsJSON = [
						...(action.params.deletedObjectsJSON || []),
						...(Array.isArray(deletedObjectsJSON)
							? deletedObjectsJSON
							: toJSON(deletedObjects)),
					];
				}
			},
		},
		{
			// NB: EAGER on purpose, unlike the delete/erase payloads.
			//
			// This fires on every stroke commit, and `toJSON()` on a long
			// OptimizedPencilStroke measures ~0.2ms desktop / ~2ms mid-Android —
			// real, and on an already-crowded frame, but small. Deferring it is
			// NOT equivalent to the delete case: an added object stays on the
			// canvas and keeps mutating, so a lazy serialization would capture
			// whatever state it had at UNDO time, not at add time. That is only
			// safe while every intervening mutation has its own history entry
			// undone first — true today, but a silent redo-restores-wrong-state
			// bug the moment it isn't. Not worth 2ms.
			//
			// The scalable win here is making the stroke cheaper to serialize
			// (roadmap item 2 in DRAW_ENGINE.md), not deferring it.
			on: "object:added",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({
					type: HistoryEvent.ObjectsAdded,
					// Shared with the sync emit + bakery mirror on this same dispatch.
					params: { objectsJSON: [serializeOnce(e.target)] },
				});
			},
		},
		{
			on: "objects:added",
			handler: (e: any) => {
				const targets = e.target as FabricObject[];
				// The caller already recorded ONE entry covering this change and is
				// firing the event purely to reach the sync engine (layer flatten in a
				// room). A second entry here would make one action take two undos.
				if (e.skipHistory) return;
				if (e.deferHistorySnapshot) {
					const action: any = {
						type: HistoryEvent.ObjectsAdded,
						params: { objectIds: toObjectsIds(targets) },
					};
					// The import history entry retains UUIDs only. Its exact redo snapshot
					// is captured in yielded slices if the user actually undoes it.
					action.__w = referenceHistoryWeight(targets.length);
					addToUndoStackWithResetRedo(action);
				} else {
					addToUndoStackWithResetRedo({
						type: HistoryEvent.ObjectsAdded,
						params: { objectsJSON: toJSON(targets) },
					});
				}
			},
		},
		{
			on: "objectsDeleted",
			handler: (e: any) => {
				const targets = e.target as FabricObject[];
				// See `skipHistory` on objects:added — sync-only re-dispatch.
				if (e.skipHistory) return;
				// Deferred for the same reason as the erase payload: deleting a
				// 300-object selection ran 300 synchronous `toJSON()` calls in the
				// delete frame, and the result is only ever read if the user
				// UNDOES. Deleted objects are off-canvas and never mutate again,
				// so serializing later yields identical JSON.
				//
				// `redoObjectsDeleted` only reads `.id`, so a redo after an undo
				// costs nothing extra — the undo already materialized it.
				const params: any = {};
				defineLazyJSON(params, "objectsJSON", targets);
				const action: any = {
					type: HistoryEvent.ObjectsDeleted,
					params,
				};
				// Precompute so trimStacks/actionWeight never reads the lazy param.
				action.__w = 1 + targets.length;
				addToUndoStackWithResetRedo(action);
			},
		},

		{
			on: "object:modified",
			handler: (e: any) => {
				const obj = e.target;

				// Handle text objects without a transform
				if (!e.transform && isText([obj])) {
					const action = handleTextModification(obj);
					addToUndoStack(action);
					return;
				}

				const captureStartedAt = performance.now();
				try {
					const activeObject = c!.getActiveObject()!;
					const objects = c!.getActiveObjects();
					const translation = transform.activeTranslationDelta();
					const { getSelectedObjectOriginalStates } = useSelect();
					const originalStates = getSelectedObjectOriginalStates();

					const changes = objects.map((obj) => {
						if (translation) {
							const forward = {
								left: translation.x,
								top: translation.y,
								scaleX: 0,
								scaleY: 0,
								angle: 0,
							};
							return {
								id: obj.id,
								forward,
								backward: {
									left: -forward.left,
									top: -forward.top,
									scaleX: 0,
									scaleY: 0,
									angle: 0,
								},
							};
						}
						const original = originalStates.get(obj.id);
						const current = getAbsoluteState(obj);
						return {
							id: obj.id,
							forward: getObjectDiff(current, original),
							backward: getObjectDiff(original, current),
						};
					});

					addToUndoStackWithResetRedo({
						type: HistoryEvent.ObjectModified,
						params: {
							changes,
							activeObjectId: activeObject?.id ?? null,
						},
					});
				} finally {
					recordPhase(
						"historyTransformCapture",
						performance.now() - captureStartedAt,
					);
				}
			},
		},
		{
			on: "fullErase",
			handler: (e: any) => {
				const action: any = {
					type: HistoryEvent.FullErase,
					params: {
						objects: e.objects,
						previousBackgroundColor: e.previousBackgroundColor,
					},
				};
				action.__w = 1 + e.objects.length;
				addToUndoStackWithResetRedo(action);
			},
		},
		{
			on: "layer:changed",
			handler: (e: any) => {
				const type = e.type as
					| DrawAction.MoveObjectUpOneLayer
					| DrawAction.MoveObjectDownOneLayer
					| DrawAction.MoveObjectToBack
					| DrawAction.MoveObjectToFront;

				const typeMapping: Partial<Record<DrawAction, HistoryEvent>> = {
					[DrawAction.MoveObjectUpOneLayer]: HistoryEvent.MoveObjectUpOneLayer,
					[DrawAction.MoveObjectDownOneLayer]:
						HistoryEvent.MoveObjectDownOneLayer,
					[DrawAction.MoveObjectToFront]: HistoryEvent.MoveObjectToFront,
					[DrawAction.MoveObjectToBack]: HistoryEvent.MoveObjectToBack,
				};

				addToUndoStackWithResetRedo({
					type: typeMapping[type]!,
					params: {
						objectIds: toObjectsIds(e.target),
						prevObjectPositions: e?.prevObjectPositions,
						prevZ: e?.prevZ,
					},
				});
			},
		},
		{
			on: "flip",
			handler: (e: any) => {
				if (e.direction == HistoryEvent.FlipX) {
					addToUndoStackWithResetRedo({
						type: HistoryEvent.FlipX,
						params: { objectIds: toObjectsIds(e.target) },
					});
				} else if (e.direction == HistoryEvent.FlipY) {
					addToUndoStackWithResetRedo({
						type: HistoryEvent.FlipY,
						params: { objectIds: toObjectsIds(e.target) },
					});
				}
			},
		},
		{
			on: "objectsCopied",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({
					type: HistoryEvent.ObjectsCopied,
					params: { objectsJSON: e.target },
				});
			},
		},
		{
			on: "backgroundColorChanged",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({
					type: HistoryEvent.BackgroundColorChanged,
					params: { previousColor: e.previousColor },
				});
			},
		},
		{
			on: "textStyleChanged",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({
					type: HistoryEvent.TextStyleChanged,
					params: {
						prevStyle: e.prevStyle,
						objectId: toObjectsIds(e.target)[0],
						newStyle: null,
					},
				});
			},
		},
		{
			on: "objectStyleChanged",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({
					type: HistoryEvent.ObjectStyleChanged,
					params: {
						prevStyles: e.prevStyles,
						objectIds: toObjectsIds(e.target),
						newStyles: null,
					},
				});
			},
		},
		{
			on: "imgFilterChanged",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({
					type: HistoryEvent.ImgFilterChanged,
					params: {
						prevFilter: e.prevFilter,
						objectId: e.target.id,
						newFilter: null,
						prevBlendColorFilter: e.prevBlendColorFilter,
					},
				});
			},
		},
		{
			on: "objectsMerged",
			handler: (e: any) => {
				addToUndoStackWithResetRedo({ type: HistoryEvent.Merge, params: e });
			},
		},
	];

	const { actionWithoutEvents } = useDrawEventManager();

	function createHistoryContext(): HistoryContext {
		const { getCanvas } = useDrawStore();

		return {
			canvas: getCanvas(),
			updateQuadTree,
			unSelect,
			getObjectById,
			getObjectsById,
			undoneEraseStrokeIds,
		};
	}

	/** Every erase currently sitting on the REDO stack, i.e. undone and not
	 *  redone. Their clip strokes must not survive on a restored object. */
	function undoneEraseStrokeIds(): Set<string> {
		const ids = new Set<string>();
		for (const action of redoStack as any[]) {
			if (action?.type === HistoryEvent.Erasing && action.params?.strokeId) {
				ids.add(action.params.strokeId);
			}
		}
		return ids;
	}

	// ─── history op serialization ────────────────────────────────────────────
	// Undo/redo handlers are ASYNC (erase undo enlivens the stroke, awaits
	// eraseObject, etc). Without a lock, spamming undo started handler #2 while
	// #1 was parked at an await — two handlers then mutated the SAME object's
	// clipPath interleaved (a corrupt clip neither undo alone would produce:
	// the object is PERMANENTLY changed, no bake can fix it), and because the
	// push to the opposite stack happens after the await, out-of-order
	// completion also scrambled redo-stack order. All ops run through one FIFO
	// chain; the stack pop happens INSIDE the queued task so it reads stack
	// state at execution time, not at click time.
	let historyChain: Promise<unknown> = Promise.resolve();

	/**
	 * Ops queued but not yet finished. While this is > 0 the engine is held in a
	 * single mutation + batch window, so a burst of undos (key repeat) costs ONE
	 * repair pass instead of one per keypress — and no bake can rasterize a
	 * half-applied step in between.
	 */
	let queuedHistoryOps = 0;
	let historyBurstOpen = false;
	let historyBurstCloseTimer: ReturnType<typeof setTimeout> | null = null;
	const HISTORY_BURST_GRACE_MS = 60;

	function openHistoryBurst() {
		queuedHistoryOps++;
		if (historyBurstCloseTimer !== null) {
			clearTimeout(historyBurstCloseTimer);
			historyBurstCloseTimer = null;
		}
		if (historyBurstOpen) return;
		historyBurstOpen = true;
		const mgr = useDrawObjectManager();
		mgr.setMutating(true);
		mgr.beginBatch();
	}

	function closeHistoryBurst() {
		if (--queuedHistoryOps > 0) return;
		queuedHistoryOps = 0;
		if (historyBurstCloseTimer !== null) {
			clearTimeout(historyBurstCloseTimer);
		}
		historyBurstCloseTimer = setTimeout(() => {
			historyBurstCloseTimer = null;
			if (queuedHistoryOps > 0 || !historyBurstOpen) return;
			historyBurstOpen = false;
			const mgr = useDrawObjectManager();
			const flushStartedAt = performance.now();
			// CLOSE THE MUTATION FIRST, then flush.
			//
			// `mutating` makes the engine skip synchronous repair and overview
			// patches, because mid-burst the scene is half-applied and rendering it
			// would rasterize a torn state. But the batch flush is the ONE moment
			// where the scene IS settled and the repair has to happen — running it
			// while still "mutating" meant every undo and redo skipped its repair
			// entirely and sat on a coarse fallback until the async bake landed.
			// That is the "undo/move/erase-undo pops a low-res version" report.
			//
			// Closing first costs nothing: setMutating(false) only requests a frame
			// (RAF) and schedules a debounced bake, both of which land after the
			// synchronous endBatch below.
			mgr.setMutating(false);
			mgr.endBatch();
			recordPhase("historyBurstFlush", performance.now() - flushStartedAt);
		}, HISTORY_BURST_GRACE_MS);
	}

	function enqueueHistoryOp<T>(fn: () => Promise<T>): Promise<T> {
		// Also wait out any in-flight erase commit. The eraser brush fires "end"
		// synchronously and does not await its async handler, so the stroke is
		// already applied to every target's clipPath while its undo entry does
		// not exist yet. An undo landing there popped the PREVIOUS action, and
		// the late addToUndoStackWithResetRedo then wiped the redo entry it had
		// just created — the newest stroke stayed applied, unundoable.
		const gated = async () => {
			try {
				await useEraser().whenErasingSettled();
			} catch {
				/* never block history on a broken barrier */
			}
			const startedAt = performance.now();
			try {
				const result = await fn();
				// Key-repeat and the benchmark can queue many individually-small
				// operations. A task boundary prevents their promise continuations from
				// becoming one uninterrupted undo/redo long task.
				await yieldToMain("history-queue");
				return result;
			} finally {
				recordPhase("historyOp", performance.now() - startedAt);
				closeHistoryBurst();
			}
		};
		// Opened at ENQUEUE time, not at run time: that is what makes a key-repeat
		// burst one window. The counter only returns to zero once the last queued
		// op has finished.
		openHistoryBurst();
		const run = historyChain.then(gated, gated);
		historyChain = run.catch(() => {}); // one failed op must not jam the chain
		return run;
	}

	function undo() {
		return enqueueHistoryOp(async () => {
			if (undoStack.length == 0) return;

			const action = undoStack.pop() as HistoryAction;

			unSelect();
			// Batch: a multi-region undo (move/style/multi-delete) coalesces into ONE
			// invalidateRegions pass instead of per-region sync tile rebuilds.
			beginBatch();
			try {
				await actionWithoutEvents(async () => {
					const newAction = await undoActionMapping[action.type](
						createHistoryContext(),
						action as any,
					);
					addToRedoStack(newAction);
				});
			} finally {
				endBatch();
			}
			undoStackCounter.value = undoStack.length;

			lastActionType.value = "undo"; // important that it needs to be before the emit
			c!.fire("undo", action);
		});
	}

	function redo() {
		return enqueueHistoryOp(async () => {
			if (redoStack.length == 0) return;
			const action = redoStack.pop() as HistoryAction;
			unSelect();
			beginBatch();
			try {
				await actionWithoutEvents(async () => {
					const newAction = await redoActionMapping[action.type](
						createHistoryContext(),
						action as any,
					);
					addToUndoStack(newAction);
				});
			} finally {
				endBatch();
			}
			redoStackCounter.value = redoStack.length;
			lastActionType.value = "redo";
			c!.fire("redo", action);
		});
	}

	// used when we want to cancel the last action for multiplayer, used in the syncing logic only
	// Same FIFO chain as undo/redo — the sync engine can fire these while a
	// user-triggered undo is mid-await, and the same clip-mutation interleaving
	// applies.
	function silentUndo() {
		return enqueueHistoryOp(async () => {
			const action = undoStack.pop() as HistoryAction | undefined;
			if (!action) return;
			await actionWithoutEvents(async () => {
				await undoActionMapping[action.type](
					createHistoryContext(),
					action as any,
				);
			});
			reset();
		});
	}

	function silentRedo() {
		return enqueueHistoryOp(async () => {
			const action = redoStack.pop() as HistoryAction | undefined;
			if (!action) return;
			await actionWithoutEvents(async () => {
				await redoActionMapping[action.type](
					createHistoryContext(),
					action as any,
				);
			});
			reset();
		});
	}

	/**
	 * Is this erase still recorded in history — i.e. could an undo restore what
	 * its deferred cleanup sweep is about to delete?
	 *
	 * Both stacks, because the user may already have undone (and redone) it.
	 * A `false` means the entry has been trimmed, so a deletion made now could
	 * never be reversed.
	 */
	function hasErasingAction(strokeId: string): boolean {
		if (!strokeId) return false;
		const inStack = (stack: HistoryAction[]) =>
			stack.some(
				(a: any) =>
					a.type === HistoryEvent.Erasing && a.params?.strokeId === strokeId,
			);
		return inStack(undoStack) || inStack(redoStack);
	}

	function init(canvas: Canvas) {
		c = canvas;

		const drawEventManager = useDrawEventManager();
		drawEventManager.addEventsOfService("history", events);
		// Injected rather than imported: the eraser store cannot import history
		// (history already imports the eraser for its erase-settled barrier), and
		// a cycle between two pinia stores is how "cannot access before
		// initialization" bugs start.
		useEraser().setErasureDeletionGuard(hasErasingAction);
		resetUndoStack();
		resetRedoStack();
	}

	function resetUndoStack() {
		undoStack = [];
		undoStackCounter.value = 0;
	}

	function resetRedoStack() {
		redoStack = [];
		redoStackCounter.value = 0;
	}

	function addToUndoStackWithResetRedo<T extends HistoryEvent>(
		action: HistoryAction<T>,
	) {
		lastActionType.value = "normal";
		resetRedoStack();
		addToUndoStack(action);
	}

	function addToUndoStack<T extends HistoryEvent>(action: HistoryAction<T>) {
		undoStack.push(action);
		trimStacks();
		undoStackCounter.value = undoStack.length;
		redoStackCounter.value = redoStack.length;
		EventBus.emit("add_to_undo_stack", action);
	}

	function addToRedoStack<T extends HistoryEvent>(action: HistoryAction<T>) {
		redoStack.push(action);
		// Undo is the ONLY way entries reach this stack, so this is where an
		// unbounded redo heap used to grow. Trim here too.
		trimStacks();
		undoStackCounter.value = undoStack.length;
		redoStackCounter.value = redoStack.length;
	}

	/**
	 * The live benchmark mutates the loaded drawing and must never undo past the
	 * strokes it created. Verify the complete chronological tail before it
	 * starts replaying history.
	 */
	function hasRecentEraseActions(strokeIds: string[]): boolean {
		if (strokeIds.length > undoStack.length) return false;
		const offset = undoStack.length - strokeIds.length;
		return strokeIds.every((strokeId, index) => {
			const action = undoStack[offset + index] as any;
			return (
				action.type === HistoryEvent.Erasing &&
				action.params.strokeId === strokeId
			);
		});
	}

	function clearStackOfPolygonHistory() {
		undoStack = undoStack.filter(
			(historyAction: HistoryAction) =>
				historyAction.type !== HistoryEvent.PolygonCreation,
		);
		redoStack = redoStack.filter(
			(historyAction: HistoryAction) =>
				historyAction.type !== HistoryEvent.PolygonCreation,
		);
		undoStackCounter.value = undoStack.length;
		redoStackCounter.value = redoStack.length;
	}

	function reset() {
		resetUndoStack();
		resetRedoStack();
	}

	function destroy() {
		if (historyBurstCloseTimer !== null) clearTimeout(historyBurstCloseTimer);
		historyBurstCloseTimer = null;
		queuedHistoryOps = 0;
		if (historyBurstOpen) {
			historyBurstOpen = false;
			const mgr = useDrawObjectManager();
			mgr.setMutating(false);
			mgr.endBatch();
		}
		useDrawEventManager().removeEventsOfService("history");
		useEraser().setErasureDeletionGuard(() => false);
		reset();
		c = undefined;
	}

	return {
		undo,
		redo,
		init,
		undoStackCounter,
		redoStackCounter,
		addToUndoStack,
		addToRedoStack,
		clearStackOfPolygonHistory,
		reset,
		destroy,
		addToUndoStackWithResetRedo,
		// Exposed so other recorders (layer deletion) can defer their payload the
		// same way. Callers using it MUST precompute `action.__w`.
		defineLazyJSON,
		createHistoryContext,
		lastActionType,
		silentUndo,
		silentRedo,
		undoDisabled,
		redoDisabled,
		hasRecentEraseActions,
	};
});
