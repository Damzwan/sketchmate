import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import type {
	DrawAction,
	DrawActionParams,
} from "@/draw/actions/drawAction.types";
import { drawActionMapping } from "@/draw/actions/drawActions";
import { useCanvasController } from "@/draw/canvas/canvasController";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { useCanvasPreview } from "@/draw/document/canvasPreview";
import { useDocumentStore } from "@/draw/document/document.store";
import { computeBounds } from "@/draw/document/export";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { destroyGestures, enableGestures } from "@/draw/input/gestures";
import { useShortcutManager } from "@/draw/input/shortcutManager";
import { useDrawSyncEngine } from "@/draw/sync/drawSyncEngine";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useEraser } from "@/draw/tools/eraser.store";
import { shutdownErasureAnalysisWorker } from "@/draw/tools/erasureAnalysisClient";
import { useGestureStore } from "@/draw/tools/gesture.store";
import { DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";

export const useDrawStore = defineStore("draw", () => {
	const canvasController = useCanvasController();
	const toolSelection = useToolSelection();
	const drawObjectManager = useDrawObjectManager();
	const shortcutManager = useShortcutManager();
	const drawEventManager = useDrawEventManager();

	const drawHistory = useDrawHistoryManager();
	const drawSyncEngine = useDrawSyncEngine();
	const drawUI = useDrawUIStore();

	const isGesturing = ref(false);
	const isCanvasInitialized = ref(false);
	let initGeneration = 0;
	let initController: AbortController | null = null;

	const {
		createPreview,
		preview,
		newPreview,
		crop,
		reset: resetPreview,
		getDataToSend,
		waitForPending: waitForPendingPreview,
		isLoading: isLoadingPreview,
	} = useCanvasPreview();

	const prevDrawingMode = ref(false);

	function isAbortError(error: unknown): boolean {
		return error instanceof DOMException && error.name === "AbortError";
	}

	function assertActiveInitialization(
		generation: number,
		signal: AbortSignal,
	): void {
		if (signal.aborted || generation !== initGeneration) {
			throw new DOMException("Drawing initialization superseded", "AbortError");
		}
	}

	function releaseSessionResources(): void {
		// Remove handlers and stores that retain the Fabric canvas before disposing
		// the canvas itself. Every function is idempotent so partial init is safe.
		drawHistory.destroy();
		drawSyncEngine.destroy();
		toolSelection.destroy();
		useClaimArea().destroy();
		shortcutManager.destroy();
		destroyGestures();
		drawEventManager.destroy();
		drawUI.destroy();
		useDocumentStore().disposeSession();
		shutdownErasureAnalysisWorker();
		resetPreview();
		canvasController.destroyCanvas();
		isCanvasInitialized.value = false;
		isGesturing.value = false;
		useDrawSyncer().isLoadingCanvas = false;
	}

	async function initCanvas(
		el: HTMLCanvasElement,
		options: { isLobby: boolean; draftId?: string; canvasUrl?: string },
	) {
		initController?.abort();
		const generation = ++initGeneration;
		const controller = new AbortController();
		initController = controller;
		const { signal } = controller;
		const { isLoadingCanvas } = storeToRefs(useDrawSyncer());
		isLoadingCanvas.value = true;

		try {
			releaseSessionResources();
			isLoadingCanvas.value = true;
			assertActiveInitialization(generation, signal);

			const c = canvasController.createCanvas(el);
			// Mark the real drawing surface. The global Canvas.prototype.add override
			// (Fabric setup) runs its claimed-area guard only for this canvas, so
			// throwaway fabric canvases (PenMenu brush preview, avatar previews, …)
			// aren't affected by lobby claim state.
			(c as any).__isMainDrawCanvas = true;

			const documentStore = useDocumentStore();
			documentStore.init(c);
			await documentStore.loadCanvas(c, { ...options, signal });
			assertActiveInitialization(generation, signal);

			canvasController.backgroundColor.value = c.backgroundColor as string;

			drawEventManager.init(c);
			enableGestures(c);
			toolSelection.init(c);
			drawHistory.init(c);
			drawObjectManager.init(c);
			useClaimArea().init(c);
			shortcutManager.init(c);
			drawSyncEngine.init();
			drawUI.init(c);
			assertActiveInitialization(generation, signal);

			toolSelection.selectTool(DrawTool.Pen, { skipOpenMenu: true });

			// Hold the loading indicator until the canvas is genuinely usable —
			// overview built, visible tiles baked (or the budget spent). Clearing it
			// any earlier hands the user a blank canvas and the first bake pass at
			// the same time, which reads as "it loaded and then broke".
			//
			// A room load reaches the same state through drawObjectManager's
			// endLoading(); this is the solo/draft path, which never went through it.
			await drawObjectManager.prepareFirstPaint(signal);
			assertActiveInitialization(generation, signal);

			drawObjectManager.renderViewport();
			isCanvasInitialized.value = true;
		} catch (error) {
			if (generation === initGeneration) releaseSessionResources();
			if (!isAbortError(error)) throw error;
		} finally {
			if (generation === initGeneration) {
				isLoadingCanvas.value = false;
				if (initController === controller) initController = null;
			}
		}
	}

	/** Stop new work and wait until an in-flight eraser commit is snapshot-safe. */
	async function prepareForExit(): Promise<void> {
		initController?.abort();
		initController = null;
		initGeneration++;
		useEraser().cancelErase();
		await useEraser().whenErasingSettled();
	}

	function disposeSession(): void {
		initController?.abort();
		initController = null;
		initGeneration++;
		releaseSessionResources();
	}

	async function selectAction<A extends DrawAction>(
		action: A,
		params: DrawActionParams[A],
	) {
		await drawActionMapping[action](params);
	}

	function reset() {
		canvasController.resetCanvas();
		drawHistory.reset();

		const gestureStore = useGestureStore();
		gestureStore.setRenderedVpt(canvasController.getCanvas().viewportTransform);
	}

	function getAspectRatio(): number {
		const c = canvasController.getCanvas();
		if (!c) return 0;
		const bounds = computeBounds(c.getObjects());
		return bounds.width / bounds.height;
	}

	return {
		initCanvas,
		reset,
		selectAction,
		getCanvas: canvasController.getCanvas,
		backgroundColor: canvasController.backgroundColor,
		prevDrawingMode,
		getAspectRatio,
		isGesturing,
		isCanvasInitialized,
		prepareForExit,
		disposeSession,
		createPreview,
		preview,
		newPreview,
		crop,
		resetPreview,
		getDataToSend,
		waitForPendingPreview,
		isLoadingPreview,
	};
});
