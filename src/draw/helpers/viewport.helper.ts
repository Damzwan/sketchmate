import { ActiveSelection, Canvas, FabricObject, Point } from "fabric";
import { useDrawStore } from "@/draw/store/draw.store";
import { storeToRefs } from "pinia";
import { CANVAS_SIZE } from "@/draw/config/canvas.config";
import { useDrawUIStore } from "@/draw/store/drawUI.store";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";

export function initViewport(c: Canvas) {
	const initX = (c.width - CANVAS_SIZE) / 2;
	const initY = (c.height - CANVAS_SIZE) / 2;
	c.setViewportTransform([1, 0, 0, 1, initX, initY]);
}

export function centerObjectInViewport(canvas: Canvas, object: FabricObject) {
	const canvasEl = canvas.upperCanvasEl;
	if (!canvasEl) return;

	const rect = canvasEl.getBoundingClientRect();

	// 1. Calculate the center of the canvas element in the browser viewport
	const clientCenter = {
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	};

	const pointer = canvas.getScenePoint({
		clientX: clientCenter.x,
		clientY: clientCenter.y,
	} as MouseEvent);

	// 3. Position the object
	object.set({
		left: pointer.x,
		top: pointer.y,
		originX: "center",
		originY: "center",
	});

	object.setCoords();
}

export function resetZoom() {
	const { getCanvas } = useDrawStore();
	const { canResetView } = storeToRefs(useDrawUIStore());

	const c = getCanvas();
	c.setZoom(1);
	const initX = (c.width - CANVAS_SIZE) / 2;
	const initY = (c.height - CANVAS_SIZE) / 2;
	c.setViewportTransform([1, 0, 0, 1, initX, initY]);
	canResetView.value = false;

	c.fire("zoomReset");
}

export function precalculateAndSetViewport(
	canvas: Canvas,
	jsonObjects: any[],
	padding = 0.8,
	maxZoom = 1.0,
) {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;

	jsonObjects.forEach((obj) => {
		// Better bounds check accounting for origins and stroke widths
		const scaleX = obj.scaleX || 1;
		const scaleY = obj.scaleY || 1;
		const stroke = obj.strokeWidth || 0;

		const width = obj.width * scaleX + stroke;
		const height = obj.height * scaleY + stroke;

		let left = obj.left || 0;
		let top = obj.top || 0;

		// Adjust if the origin isn't top-left (very common with paths/groups in Fabric)
		if (obj.originX === "center") left -= width / 2;
		if (obj.originY === "center") top -= height / 2;

		if (left < minX) minX = left;
		if (top < minY) minY = top;
		if (left + width > maxX) maxX = left + width;
		if (top + height > maxY) maxY = top + height;
	});

	if (minX === Infinity) return;

	const contentWidth = maxX - minX;
	const contentHeight = maxY - minY;
	const canvasWidth = canvas.getWidth();
	const canvasHeight = canvas.getHeight();

	const scaleX = canvasWidth / (contentWidth || 1);
	const scaleY = canvasHeight / (contentHeight || 1);

	// Calculate zoom, apply padding, and clamp it to min/max bounds
	let fitZoom = Math.min(scaleX, scaleY) * padding;
	fitZoom = Math.max(fitZoom, 0.01);
	fitZoom = Math.min(fitZoom, maxZoom);

	const centerX = canvasWidth / 2 - (minX + contentWidth / 2) * fitZoom;
	const centerY = canvasHeight / 2 - (minY + contentHeight / 2) * fitZoom;

	canvas.setViewportTransform([fitZoom, 0, 0, fitZoom, centerX, centerY]);
}

export function fitAndCenterAllActualObjects(
	canvas: Canvas,
	padding = 0.8,
	maxZoom = 1.0,
) {
	const objects = canvas.getObjects();
	if (objects.length === 0) return;

	// Temporarily group them to get the absolute perfect bounding rect of everything
	const selection = new ActiveSelection(objects, { canvas });
	const rect = selection.getBoundingRect();

	// Important: Clean up the selection object so it doesn't leave a visual artifact or memory leak
	selection.removeAll();
	selection.dispose();

	const canvasWidth = canvas.getWidth();
	const canvasHeight = canvas.getHeight();

	const scaleX = canvasWidth / (rect.width || 1);
	const scaleY = canvasHeight / (rect.height || 1);

	let fitZoom = Math.min(scaleX, scaleY) * padding;
	fitZoom = Math.max(fitZoom, 0.05);
	fitZoom = Math.min(fitZoom, maxZoom);

	const contentCenterX = rect.left + rect.width / 2;
	const contentCenterY = rect.top + rect.height / 2;

	const panX = canvasWidth / 2 - contentCenterX * fitZoom;
	const panY = canvasHeight / 2 - contentCenterY * fitZoom;

	canvas.setViewportTransform([fitZoom, 0, 0, fitZoom, panX, panY]);
}
