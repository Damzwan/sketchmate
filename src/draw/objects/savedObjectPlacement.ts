import * as fabric from "fabric";
import { createYielder } from "@/draw/scheduling/yielder";

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

	const yielder = createYielder({
		budgetMs: 4,
		frameYieldIntervalMs: 12,
		label: "saved-drawing-layout",
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
	if (!Number.isFinite(minX)) return;

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

	yielder.reset();
	for (const object of objects) {
		fabric.util.addTransformToObject(object, transform);
		object.setCoords();
		await yielder.maybeYield();
	}
}
