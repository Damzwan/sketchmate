import { defineStore } from "pinia";
import { ShapeCreationMode } from "@/draw/types/draw.types";
import { ref, watch } from "vue";
import { useDrawStore } from "@/draw/store/draw.store";
import { Canvas, Point } from "fabric";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useDebounceFn } from "@vueuse/core";
import { useGestureStore } from "@/draw/store/tools/gesture.store";

const AVATAR_DISAPPEAR_TIMEOUT_MS = 3000;

export const useDrawUIStore = defineStore("drawUI", () => {
	const colorPickerMode = ref(false);
	const addTextMode = ref(false);
	const isEditingText = ref(false);
	const shapeCreationMode = ref<ShapeCreationMode>();
	const isLoading = ref(false);
	const loadingText = ref("");
	const canResetView = ref(false);
	const activeAvatars = ref(new Map());
	const isCanvasNavigating = ref(false);
	const isFullscreen = ref(false);
	const chatToastsSilenced = ref(false);

	const gestureStore = useGestureStore();
	const exitRequested = ref(0);

	const triggerManualExit = () => {
		exitRequested.value++;
	};

	const resumeRendering = useDebounceFn(() => {
		if (!gestureStore.isGesturing) {
			isCanvasNavigating.value = false;
		}
	}, 300);

	watch(
		() => gestureStore.isGesturing,
		(isGesturing) => {
			if (isGesturing) {
				isCanvasNavigating.value = true;
				recalculateAvatarPositions();
			} else {
				resumeRendering();
			}
		},
	);

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

	function init(c: Canvas) {}

	function destroy() {}

	return {
		colorPickerMode,
		addTextMode,
		isEditingText,
		shapeCreationMode,
		isLoading,
		loadingText,
		canResetView,
		showOrUpdateAvatar,
		activeAvatars,
		init,
		isCanvasNavigating,
		destroy,
		exitRequested,
		triggerManualExit,
		isFullscreen,
		chatToastsSilenced,
	};
});
