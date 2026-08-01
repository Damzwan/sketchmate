import { defineStore, storeToRefs } from "pinia";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import {
	DrawAction,
	type DrawActionParams,
} from "@/draw/actions/drawAction.types";
import { DrawTool } from "@/draw/tools/tool.types";
import { useCanvasController } from "@/draw/canvas/canvasController";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { drawActionMapping } from "@/draw/actions/drawActions";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useShortcutManager } from "@/draw/input/shortcutManager";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { enableGestures } from "@/draw/input/gestures";
import { ref } from "vue";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useDrawSyncEngine } from "@/draw/sync/drawSyncEngine";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { computeBounds } from "@/draw/document/export";
import { useCanvasPreview } from "@/draw/document/canvasPreview";
import { useDocumentStore } from "@/draw/document/document.store";
import { useGestureStore } from "@/draw/tools/gesture.store";
import { useClaimArea } from "@/draw/claims/claimArea.store";

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

	const {
		createPreview,
		preview,
		newPreview,
		crop,
		reset: resetPreview,
		getDataToSend,
		isLoading: isLoadingPreview,
	} = useCanvasPreview();

	const prevDrawingMode = ref(false);

	async function initCanvas(
		el: HTMLCanvasElement,
		options: { isLobby: boolean; draftId?: string; canvasUrl?: string },
	) {
		const { isLoadingCanvas } = storeToRefs(useDrawSyncer());
		isLoadingCanvas.value = true;

		canvasController.destroyCanvas();
		drawUI.destroy();

		const c = canvasController.createCanvas(el);
		// Mark the real drawing surface. The global Canvas.prototype.add override
		// (Fabric setup) runs its claimed-area guard only for this canvas, so
		// throwaway fabric canvases (PenMenu brush preview, avatar previews, …)
		// aren't affected by lobby claim state.
		(c as any).__isMainDrawCanvas = true;

		const documentStore = useDocumentStore();
		documentStore.init(c);
		await documentStore.loadCanvas(c, options);

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

		toolSelection.selectTool(DrawTool.Pen, { skipOpenMenu: true });
		drawObjectManager.renderViewport();
		isLoadingCanvas.value = false;
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
		createPreview,
		preview,
		newPreview,
		crop,
		resetPreview,
		getDataToSend,
		isLoadingPreview,
	};
});
