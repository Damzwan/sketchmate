import * as fabric from "fabric";
import { createYielder } from "@/draw/scheduling/yielder";

async function measureSceneBounds(
	objects: fabric.FabricObject[],
	label: string,
): Promise<{ minX: number; minY: number; maxX: number; maxY: number } | null> {
	const yielder = createYielder({
		budgetMs: 4,
		frameYieldIntervalMs: 12,
		label,
	});
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	yielder.reset();
	for (const object of objects) {
		const bounds = object.getBoundingRect();
		if (
			Number.isFinite(bounds.left) &&
			Number.isFinite(bounds.top) &&
			bounds.width > 0 &&
			bounds.height > 0
		) {
			minX = Math.min(minX, bounds.left);
			minY = Math.min(minY, bounds.top);
			maxX = Math.max(maxX, bounds.left + bounds.width);
			maxY = Math.max(maxY, bounds.top + bounds.height);
		}
		await yielder.maybeYield();
	}
	return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Fit a detached saved scene into the current viewport without constructing an
 * ActiveSelection over the entire scene. ActiveSelection synchronously enters
 * every child into a group, runs layout, rewrites every transform, and later
 * performs the inverse operation. On a multi-thousand-object saved drawing
 * that single uninterruptible constructor is large enough to trigger an ANR.
 *
 * Applying the same uniform scene-space matrix directly is mathematically
 * equivalent, preserves relative layout/non-uniform object scales, and lets us
 * yield between objects.
 */
export async function fitAndCenterSavedObjects(
	objects: fabric.FabricObject[],
	canvas: fabric.Canvas,
	padding = 0.8,
): Promise<void> {
	if (objects.length === 0) return;

	const bounds = await measureSceneBounds(
		objects,
		"saved-drawing-layout-bounds",
	);
	if (!bounds) return;
	const { minX, minY, maxX, maxY } = bounds;

	const width = Math.max(1, maxX - minX);
	const height = Math.max(1, maxY - minY);
	const zoom = Math.max(0.0001, canvas.getZoom());
	const availableWidth = (canvas.getWidth() / zoom) * padding;
	const availableHeight = (canvas.getHeight() / zoom) * padding;
	const scale = Math.min(1, availableWidth / width, availableHeight / height);
	const viewportCenter = fabric.util.transformPoint(
		new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
		fabric.util.invertTransform(canvas.viewportTransform!),
	);
	const sourceCenterX = minX + width / 2;
	const sourceCenterY = minY + height / 2;
	const transform: fabric.TMat2D = [
		scale,
		0,
		0,
		scale,
		viewportCenter.x - sourceCenterX * scale,
		viewportCenter.y - sourceCenterY * scale,
	];

	const yielder = createYielder({
		budgetMs: 4,
		frameYieldIntervalMs: 12,
		label: "saved-drawing-layout-transform",
	});
	yielder.reset();
	for (const object of objects) {
		fabric.util.addTransformToObject(object, transform);
		object.setCoords();
		await yielder.maybeYield();
	}
}

/**
 * Migrate a legacy scene to viewport center without constructing a scene-sized
 * ActiveSelection. This preserves object scale and yields between the otherwise
 * atomic child-transform operations.
 */
export async function centerObjectsInViewportYielded(
	objects: fabric.FabricObject[],
	canvas: fabric.Canvas,
): Promise<void> {
	if (objects.length === 0) return;
	const bounds = await measureSceneBounds(objects, "legacy-center-bounds");
	if (!bounds) return;
	const sourceCenter = new fabric.Point(
		(bounds.minX + bounds.maxX) / 2,
		(bounds.minY + bounds.maxY) / 2,
	);
	const viewportCenter = fabric.util.transformPoint(
		new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2),
		fabric.util.invertTransform(canvas.viewportTransform!),
	);
	const translation: fabric.TMat2D = [
		1,
		0,
		0,
		1,
		viewportCenter.x - sourceCenter.x,
		viewportCenter.y - sourceCenter.y,
	];
	const yielder = createYielder({
		budgetMs: 4,
		frameYieldIntervalMs: 12,
		label: "legacy-center-transform",
	});
	yielder.reset();
	for (const object of objects) {
		fabric.util.addTransformToObject(object, translation);
		object.setCoords();
		await yielder.maybeYield();
	}
}
