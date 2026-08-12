import type { Canvas, FabricObject } from "fabric";

/**
 * The canvas' object stack WITHOUT copying it.
 *
 * `canvas.getObjects()` returns `[...this._objects]` — a full copy of the scene
 * on every call. That is fine for a one-off, and wrong for anything that runs
 * per stroke or per erase: on a 7,000-object board each call allocates and
 * fills a 7,000-slot array, usually to read a single element from it.
 *
 * The result is READ-ONLY. Mutating it mutates fabric's own stack behind the
 * canvas' back, which is how objects end up rendered but unregistered.
 */
export function objectStack(
	canvas: Canvas | undefined,
): readonly FabricObject[] {
	return ((canvas as any)?._objects ?? []) as readonly FabricObject[];
}

/**
 * Stack position of every object, in ONE pass.
 *
 * The pattern this replaces — `for (const obj of selection) stack.indexOf(obj)`
 * — is O(selection x scene). Every caller of it is a bulk operation (multi
 * delete, layer delete, layer flatten, the fully-consumed-erase sweep), so the
 * selection is large exactly when the scene is: deleting a 2,000-object layer
 * from a 7,000-object drawing was 14 million reference compares on the main
 * thread, in one synchronous block, before any of the actual work started.
 */
export function stackPositions(
	canvas: Canvas | undefined,
): Map<FabricObject, number> {
	const stack = objectStack(canvas);
	const positions = new Map<FabricObject, number>();
	for (let i = 0; i < stack.length; i++) positions.set(stack[i], i);
	return positions;
}
