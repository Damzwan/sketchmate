import { modalController } from "@ionic/vue";
import Cropper from "cropperjs";
import { onBeforeUnmount, ref, watch } from "vue";
import { IS_LOW_END_DEVICE } from "@/draw/config/renderQuality.config";

type CropBoundary = { x: number; y: number; width: number; height: number };
const SETTLE_MS = IS_LOW_END_DEVICE ? 220 : 320;
const SETTLE_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function useDrawingCropper(
	source: () => string | null | undefined,
	onCrop: (boundary: CropBoundary) => void,
) {
	const isOpen = ref(false);
	const imageRef = ref<HTMLImageElement | null>(null);
	const isCropperReady = ref(false);
	const isLoaded = ref(false);
	const newAspectRatio = ref<number>();
	const isSettling = ref(false);
	let cropper: Cropper | null = null;
	let canvasElement: HTMLElement | null = null;
	let cropBoxElement: HTMLElement | null = null;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	let syncFrame = 0;
	let pendingAction: string | null = null;
	let previousBoxArea = 0;
	let shouldCrop = false;

	watch(source, (value) => {
		if (!value) newAspectRatio.value = undefined;
		isLoaded.value = false;
	});

	function initCropper() {
		shouldCrop = false;
		if (!imageRef.value) return;
		isCropperReady.value = false;
		cropper = new Cropper(imageRef.value, {
			viewMode: 1,
			dragMode: "move",
			autoCropArea: 1,
			zoomable: true,
			scalable: true,
			background: false,
			guides: false,
			center: false,
			responsive: true,
			restore: false,
			ready() {
				cacheElements();
				isCropperReady.value = true;
			},
			cropstart() {
				endSettle();
				previousBoxArea = Number.POSITIVE_INFINITY;
			},
			cropmove(event) {
				syncImageToCrop(event as CustomEvent<{ action: string }>);
			},
			cropend: autoZoomToSelection,
		});
	}

	function cacheElements() {
		const root = imageRef.value?.parentElement;
		canvasElement = root?.querySelector<HTMLElement>(".cropper-canvas") ?? null;
		cropBoxElement =
			root?.querySelector<HTMLElement>(".cropper-crop-box") ?? null;
	}

	function endSettle() {
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = null;
		for (const element of [canvasElement, cropBoxElement]) {
			if (!element) continue;
			element.style.transition = "";
			element.style.willChange = "";
			element.style.transformOrigin = "";
		}
		isSettling.value = false;
	}

	function playSettle(before: Cropper.CanvasData, after: Cropper.CanvasData) {
		if (
			!canvasElement ||
			!cropBoxElement ||
			!after.width ||
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		)
			return;
		const scale = before.width / after.width;
		const x = before.left - after.left * scale;
		const y = before.top - after.top * scale;
		if (Math.abs(scale - 1) < 0.002 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5)
			return;
		const targets = [canvasElement, cropBoxElement].map((element) => ({
			element,
			committed: element.style.transform,
		}));
		isSettling.value = true;
		for (const { element, committed } of targets) {
			element.style.transformOrigin = "0 0";
			element.style.willChange = "transform";
			element.style.transition = "none";
			element.style.transform = `translate(${x}px, ${y}px) scale(${scale}) ${committed}`;
		}
		void canvasElement.offsetWidth;
		for (const { element, committed } of targets) {
			element.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
			element.style.transform = committed;
		}
		settleTimer = setTimeout(endSettle, SETTLE_MS + 60);
	}

	function autoZoomToSelection() {
		if (!cropper) return;
		cancelSync();
		endSettle();
		const cropData = cropper.getData();
		const container = cropper.getContainerData();
		const before = cropper.getCanvasData();
		const zoom = Math.min(
			(container.width * 0.8) / cropData.width,
			(container.height * 0.8) / cropData.height,
		);
		cropper.zoomTo(zoom);
		cropper.moveTo(
			container.width / 2 - (cropData.x + cropData.width / 2) * zoom,
			container.height / 2 - (cropData.y + cropData.height / 2) * zoom,
		);
		cropper.setData(cropData);
		playSettle(before, cropper.getCanvasData());
	}

	function teardown() {
		endSettle();
		cancelSync();
		canvasElement = null;
		cropBoxElement = null;
		cropper?.destroy();
		cropper = null;
		isCropperReady.value = false;
	}

	function handleModalDismiss() {
		isOpen.value = false;
		if (!cropper || !shouldCrop) {
			teardown();
			return;
		}
		const cropData = cropper.getData(true);
		const imageData = cropper.getImageData();
		const boundary = {
			x: cropData.x / imageData.naturalWidth,
			y: cropData.y / imageData.naturalHeight,
			width: cropData.width / imageData.naturalWidth,
			height: cropData.height / imageData.naturalHeight,
		};
		isLoaded.value =
			boundary.x === 0 &&
			boundary.y === 0 &&
			boundary.width === 1 &&
			boundary.height === 1;
		newAspectRatio.value = cropData.width / cropData.height;
		teardown();
		onCrop(boundary);
	}

	function crop() {
		shouldCrop = true;
		void modalController.dismiss();
	}

	function cancelSync() {
		if (syncFrame) cancelAnimationFrame(syncFrame);
		syncFrame = 0;
		pendingAction = null;
	}

	function syncImageToCrop(event: CustomEvent<{ action: string }>) {
		pendingAction = event.detail.action;
		if (!syncFrame) syncFrame = requestAnimationFrame(runSync);
	}

	function runSync() {
		syncFrame = 0;
		const action = pendingAction;
		pendingAction = null;
		if (!cropper || !action) return;
		const container = cropper.getContainerData();
		const box = cropper.getCropBoxData();
		if (action !== "all") {
			const coverage = Math.max(
				box.width / container.width,
				box.height / container.height,
			);
			const area = box.width * box.height;
			const expanding = area > previousBoxArea;
			previousBoxArea = area;
			if (coverage > 0.85 && expanding) zoomOutAtHandle(action, box);
			return;
		}
		const left = container.width * 0.05;
		const top = container.height * 0.05;
		const right = container.width * 0.95;
		const bottom = container.height * 0.95;
		let moveX = box.left < left ? left - box.left : 0;
		let moveY = box.top < top ? top - box.top : 0;
		if (box.left + box.width > right) moveX = right - box.left - box.width;
		if (box.top + box.height > bottom) moveY = bottom - box.top - box.height;
		if (moveX || moveY) {
			cropper.move(clamp(moveX * 0.1, -10, 10), clamp(moveY * 0.1, -10, 10));
		}
	}

	function zoomOutAtHandle(action: string, box: Cropper.CropBoxData) {
		if (!cropper) return;
		const canvas = cropper.getCanvasData();
		const image = cropper.getImageData();
		const ratio = (canvas.width / image.naturalWidth) * 0.99;
		let x = box.left + box.width / 2;
		let y = box.top + box.height / 2;
		if (["se", "ne", "e"].includes(action)) x = box.left;
		if (["sw", "nw", "w"].includes(action)) x = box.left + box.width;
		if (["se", "sw", "s"].includes(action)) y = box.top;
		if (["ne", "nw", "n"].includes(action)) y = box.top + box.height;
		cropper.zoomTo(ratio, { x, y });
	}

	onBeforeUnmount(teardown);
	return {
		isOpen,
		imageRef,
		isCropperReady,
		isLoaded,
		newAspectRatio,
		isSettling,
		openModal: () => (isOpen.value = true),
		closeModal: () => (isOpen.value = false),
		initCropper,
		handleModalDismiss,
		crop,
	};
}

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));
