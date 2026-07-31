import { ActiveSelection, Canvas, FabricObject, Point } from "fabric";
import { useDrawStore } from "@/draw/session/draw.store";
import { storeToRefs } from "pinia";
import { CANVAS_SIZE } from "@/draw/config/canvas.config";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { createYielder } from "@/draw/scheduling/yielder";
import { getRenderDpr } from "@/draw/config/renderQuality.config";
import { clampToTiledZoom } from "@/draw/rendering/zoomLevels";

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
	const z = getDefaultZoom(c);
	const initX = (c.width - CANVAS_SIZE * z) / 2;
	const initY = (c.height - CANVAS_SIZE * z) / 2;
	c.setViewportTransform([z, 0, 0, z, initX, initY]);
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
	fitZoom = clampToTiledZoom(fitZoom, maxZoom, getRenderDpr());

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
	fitZoom = clampToTiledZoom(fitZoom, maxZoom, getRenderDpr());

	const contentCenterX = rect.left + rect.width / 2;
	const contentCenterY = rect.top + rect.height / 2;

	const panX = canvasWidth / 2 - contentCenterX * fitZoom;
	const panY = canvasHeight / 2 - contentCenterY * fitZoom;

	canvas.setViewportTransform([fitZoom, 0, 0, fitZoom, panX, panY]);
}

export async function fitToDensestRegion(
	canvas: Canvas,
	padding = 0.8,
	maxZoom = 1.0,
) {
	const objects = canvas.getObjects();
	if (objects.length === 0) return;
	if (objects.length === 1) {
		return fitAndCenterAllActualObjects(canvas, padding, maxZoom);
	}

	// 1. Collect centroids + bounds. Use the same method your QuadTree uses
	//    so we don't drift from the rest of the system.
	type Item = {
		cx: number;
		cy: number;
		b: { x: number; y: number; w: number; h: number };
	};
	const items: Item[] = [];
	const yielder = createYielder({
		budgetMs: 5,
		label: "viewport-density-scan",
	});
	yielder.reset();
	for (const o of objects) {
		// @ts-ignore — same call as objectBounds()
		const b = o.getBoundingRect(true, true);
		if (!isFinite(b.left) || !isFinite(b.top)) continue;
		if (b.width <= 0 || b.height <= 0) continue;
		items.push({
			cx: b.left + b.width / 2,
			cy: b.top + b.height / 2,
			b: { x: b.left, y: b.top, w: b.width, h: b.height },
		});
		await yielder.maybeYield();
	}
	if (items.length === 0) return;

	// 2. Grid-bin centroids. Cell size scales with viewport so the
	//    "densest region" is always roughly screen-sized.
	const cw = canvas.getWidth();
	const ch = canvas.getHeight();
	const cellSize = Math.max(cw, ch); // world units — one cell ≈ one screen at zoom 1
	const bins = new Map<string, Item[]>();
	for (const it of items) {
		const gx = Math.floor(it.cx / cellSize);
		const gy = Math.floor(it.cy / cellSize);
		const key = `${gx},${gy}`;
		let arr = bins.get(key);
		if (!arr) {
			arr = [];
			bins.set(key, arr);
		}
		arr.push(it);
	}

	// 3. Score each cell. Include a 1-cell neighborhood so we don't
	//    accidentally split a cluster across a cell boundary.
	let bestKey = "";
	let bestCount = -1;
	for (const [key] of bins) {
		const [gx, gy] = key.split(",").map(Number);
		let count = 0;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				count += bins.get(`${gx + dx},${gy + dy}`)?.length ?? 0;
			}
		}
		if (count > bestCount) {
			bestCount = count;
			bestKey = key;
		}
		await yielder.maybeYield();
	}

	// 4. Build the union rect from the items in the winning 3x3 neighborhood.
	const [bgx, bgy] = bestKey.split(",").map(Number);
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const arr = bins.get(`${bgx + dx},${bgy + dy}`);
			if (!arr) continue;
			for (const it of arr) {
				if (it.b.x < minX) minX = it.b.x;
				if (it.b.y < minY) minY = it.b.y;
				if (it.b.x + it.b.w > maxX) maxX = it.b.x + it.b.w;
				if (it.b.y + it.b.h > maxY) maxY = it.b.y + it.b.h;
			}
		}
	}

	// 5. Standard fit math.
	const contentW = maxX - minX;
	const contentH = maxY - minY;
	const sx = cw / (contentW || 1);
	const sy = ch / (contentH || 1);
	let zoom = Math.min(sx, sy) * padding;
	zoom = clampToTiledZoom(zoom, maxZoom, getRenderDpr());

	const ccx = minX + contentW / 2;
	const ccy = minY + contentH / 2;
	const panX = cw / 2 - ccx * zoom;
	const panY = ch / 2 - ccy * zoom;

	canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
}

export function getDefaultZoom(canvas: Canvas) {
	const zoom = Math.min(
		1,
		(Math.min(canvas.getWidth(), canvas.getHeight()) / CANVAS_SIZE) * 0.9,
	);
	return clampToTiledZoom(zoom, 1, getRenderDpr());
}
