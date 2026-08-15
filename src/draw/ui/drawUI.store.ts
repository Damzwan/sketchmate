import { type Canvas, Point } from "fabric";
import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import type { ShapeCreationMode } from "@/draw/tools/tool.types";
import { useOverlayRuntimeStore } from "@/store/overlayRuntime.store";

const AVATAR_DISAPPEAR_TIMEOUT_MS = 3000;

export const useDrawUIStore = defineStore("drawUI", () => {
	const colorPickerMode = ref(false);
	/**
	 * Where the eyedropper is pointing and what it reads there, in CSS pixels
	 * relative to the canvas element. Set by useCanvasEyedropper, rendered by
	 * EyedropperOverlay — the sampling and the loupe stay in separate files
	 * because only the overlay needs the DOM.
	 */
	const colorPickerProbe = ref<{ x: number; y: number; hex: string } | null>(
		null,
	);
	const addTextMode = ref(false);
	const isEditingText = ref(false);
	const shapeCreationMode = ref<ShapeCreationMode>();
	const isLoading = ref(false);
	const loadingText = ref("");
	const canResetView = ref(false);
	const activeAvatars = ref(new Map());
	// Re-export the lightweight global refs so existing drawing consumers keep
	// their API while ChatToasts no longer needs to import this Fabric-backed store.
	const { isFullscreen, chatToastsSilenced } = storeToRefs(
		useOverlayRuntimeStore(),
	);
	const isSavingDrawing = ref(false);
	const isLoadingDrawing = ref(false);
	const isForceExiting = ref(false);

	const exitRequested = ref(0);

	const triggerManualExit = () => {
		exitRequested.value++;
	};

	function showOrUpdateAvatar(
		userId: string,
		canvasX: number,
		canvasY: number,
	) {
		const { getCanvas } = useDrawStore();
		const canvas = getCanvas();
		if (!canvas) return;

		const canvasPoint = new Point(canvasX, canvasY);
		const screenPoint = canvasPoint.transform(canvas.viewportTransform);

		const { roomMembers } = useDrawSyncer();
		const user = roomMembers.find((member) => member._id === userId);
		if (!user) return;

		const existing = activeAvatars.value.get(user._id);
		if (existing?.timeoutId) {
			clearTimeout(existing.timeoutId);
		}

		activeAvatars.value.set(user._id, {
			...user,
			canvasX,
			canvasY,
			x: screenPoint.x,
			y: screenPoint.y,
			timeoutId: setTimeout(() => {
				activeAvatars.value.delete(user._id);
			}, AVATAR_DISAPPEAR_TIMEOUT_MS),
		});
	}

	function recalculateAvatarPositions() {
		const { getCanvas } = useDrawStore();
		const canvas = getCanvas();
		if (!canvas || !canvas.viewportTransform) return;

		activeAvatars.value.forEach((avatar) => {
			const canvasPoint = new Point(avatar.canvasX, avatar.canvasY);
			const screenPoint = canvasPoint.transform(canvas.viewportTransform);
			avatar.x = screenPoint.x;
			avatar.y = screenPoint.y;
		});
	}

	function init(_c: Canvas) {}

	function destroy() {
		activeAvatars.value.forEach((avatar) => {
			if (avatar?.timeoutId) clearTimeout(avatar.timeoutId);
		});
		activeAvatars.value.clear();
		activeAvatars.value = new Map();
		colorPickerMode.value = false;
		colorPickerProbe.value = null;
		addTextMode.value = false;
		isEditingText.value = false;
		shapeCreationMode.value = undefined;
		isLoading.value = false;
		loadingText.value = "";
		canResetView.value = false;
		isSavingDrawing.value = false;
		isLoadingDrawing.value = false;
		isForceExiting.value = false;
	}

	return {
		colorPickerMode,
		colorPickerProbe,
		addTextMode,
		isEditingText,
		shapeCreationMode,
		isLoading,
		loadingText,
		canResetView,
		showOrUpdateAvatar,
		activeAvatars,
		init,
		recalculateAvatarPositions,
		destroy,
		exitRequested,
		triggerManualExit,
		isFullscreen,
		chatToastsSilenced,
		isSavingDrawing,
		isLoadingDrawing,
		isForceExiting,
	};
});
