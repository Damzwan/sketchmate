import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import * as fabric from "fabric";
import { ActiveSelection, Canvas, FabricObject, Group } from "fabric";

import {
	DrawAction,
	type DrawActionParams,
} from "@/draw/actions/drawAction.types";
import { DrawTool } from "@/draw/tools/tool.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { v4 as uuidv4 } from "uuid";
import { useSelect } from "@/draw/tools/select.store";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/service/toast.service";
import { centerObjectInViewport } from "@/draw/canvas/viewport";
import { computeBounds, exportBoundingBoxImage } from "@/draw/document/export";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { toJSON, toObjectsIds } from "@/draw/objects/objectSerialization";
import { useDrawSyncer } from "@/draw/sync/session.store";
import {
	enlivenAllBatched,
	enlivenObjectsTimeSlivered,
	generateChunkedJSON,
	migrateLegacyOrigin,
} from "@/draw/document/serialization";
import { createSavedDrawing } from "@/service/api/savedDrawing.api";
import { useShareToastStore } from "@/draw/sharing/shareToast.store";

export async function removeObjects(objects: FabricObject[]) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	if (objects.length === 0) return;

	// Record each object's stack position BEFORE removal so undo restores it at
	// its original z instead of on top (insertedIndex is serialized into the
	// history JSON via customProperties, and undoObjectsDeleted re-inserts at
	// it). Captured against the same full stack → ascending re-insert on undo
	// reproduces the layering exactly.
	const stack = c.getObjects();
	for (const obj of objects) {
		(obj as any).insertedIndex = stack.indexOf(obj);
	}

	// Multi-delete: coalesce the N object:removed invalidations into one
	// invalidateRegions pass instead of N destructive sync tile rebuilds.
	const drawObjects = useDrawObjectManager();
	if (objects.length > 1) drawObjects.beginBatch();
	try {
		c.remove(...objects);
	} finally {
		if (objects.length > 1) drawObjects.endBatch();
	}

	c.fire("objectsDeleted", { target: objects });
}

export async function removeSelectedObjects() {
	const { getSelectedObjects, unSelect } = useSelect();
	const selected = getSelectedObjects();

	const { isPublicLobby } = useDrawSyncer();
	if (isPublicLobby) {
		const { user } = useAuthStore();
		if (selected.find((o) => o.userId !== user?._id)) {
			const { toast } = useToast();
			toast("Cannot deleted objects from other user", { color: "warning" });
			return;
		}
	}

	unSelect();
	await removeObjects(selected);
}

// TODO this should be the function that should be used with everything...
export function setPropertiesOfObjects(
	params: DrawActionParams[DrawAction.SetPropertiesOfObject],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	params.objects.forEach((obj: any) => {
		obj.set(params.properties);
	});

	c.fire("objects:changed", {
		target: params.objects,
		parameters: params.properties,
	});
}

function sortObjectsByLayer(
	objects: FabricObject[],
	c: Canvas,
	reverse = false,
) {
	// getObjects() copies the whole stack — never call it inside a comparator.
	const order = new Map(c.getObjects().map((o, i) => [o, i]));
	const sorted = objects.sort(
		(a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
	);
	return reverse ? sorted.reverse() : sorted;
}

export function moveObjectToFront(
	params: DrawActionParams[DrawAction.MoveObjectToFront],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	const sortedObjects = sortObjectsByLayer(params.objects, c);

	const prevObjectPositions: number[] = [];
	const stack = (c as any)._objects as FabricObject[]; // live ref, no copy per object

	// Snapshot z BEFORE the move so undo can restore it. Order matches objectIds
	// (= toObjectsIds(params.objects)), which is what undo looks up.
	const ids = toObjectsIds(params.objects);
	const prevZ = useDrawObjectManager().zGet(ids);

	sortedObjects.forEach((obj: any) => {
		const currI = stack.indexOf(obj);
		prevObjectPositions.push(currI);
		c.bringObjectToFront(obj);
	});

	// Explicit z is the render/hit-test authority (canvas order is cosmetic now).
	useDrawObjectManager().zToFront(ids);

	c.fire("layer:changed", {
		target: params.objects,
		type: DrawAction.MoveObjectToFront,
		prevObjectPositions,
		prevZ,
	});
}

export function moveObjectToBack(
	params: DrawActionParams[DrawAction.MoveObjectToBack],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	const sortedObjects = sortObjectsByLayer(params.objects, c, true);

	const prevObjectPositions: number[] = [];
	const stack = (c as any)._objects as FabricObject[];

	const ids = toObjectsIds(params.objects);
	const prevZ = useDrawObjectManager().zGet(ids);

	sortedObjects.forEach((obj: any) => {
		const currI = stack.indexOf(obj);
		prevObjectPositions.push(currI);
		c.sendObjectToBack(obj);
	});

	useDrawObjectManager().zToBack(ids);

	c.fire("layer:changed", {
		target: params.objects,
		type: DrawAction.MoveObjectToBack,
		prevObjectPositions,
		prevZ,
	});
}

export function moveObjectUpOneLayer(
	params: DrawActionParams[DrawAction.MoveObjectUpOneLayer],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	const sortedObjects = sortObjectsByLayer(params.objects, c, true);
	const stack = (c as any)._objects as FabricObject[];
	const objectsLength = stack.length - 1;

	sortedObjects.forEach((obj: any) => {
		const currI = stack.indexOf(obj);
		c.moveObjectTo(obj, Math.min(currI + 1, objectsLength));
	});

	useDrawObjectManager().zUpOne(toObjectsIds(params.objects));

	c.fire("layer:changed", {
		target: params.objects,
		type: DrawAction.MoveObjectUpOneLayer,
	});
}

export function moveObjectDownOneLayer(
	params: DrawActionParams[DrawAction.MoveObjectUpOneLayer],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	const sortedObjects = sortObjectsByLayer(params.objects, c, false);
	const stack = (c as any)._objects as FabricObject[];

	sortedObjects.forEach((obj: any) => {
		const currI = stack.indexOf(obj);
		c.moveObjectTo(obj, Math.max(currI - 1, 0));
	});

	useDrawObjectManager().zDownOne(toObjectsIds(params.objects));

	c.fire("layer:changed", {
		target: params.objects,
		type: DrawAction.MoveObjectDownOneLayer,
	});
}

export async function copyObjects(
	params: DrawActionParams[DrawAction.CopyObject],
) {
	const { getCanvas } = useDrawStore();
	const { actionWithoutEvents } = useDrawEventManager();
	const drawObjects = useDrawObjectManager();
	const c = getCanvas();

	if (params.objects.length > 200) {
		const { toast } = useToast();
		toast("Cannot copy more than 200 objects", { color: "warning" });
		return;
	}

	const offsetX = 10,
		offsetY = 10;
	const sources = params.objects;
	let clonedObjects: FabricObject[] = [];

	await actionWithoutEvents(async () => {
		c.discardActiveObject();

		const serialized = sources.map((o) => o.toObject());
		clonedObjects = await enlivenAllBatched(serialized);

		// Apply offset + ids while the clones are still detached. setCoords is
		// mandatory: the engine bypasses fabric's render loop (which would refresh
		// oCoords), so without it the first control grab on a copy transforms from
		// stale corners — the "shrinks on first scale" glitch.
		clonedObjects.forEach((obj, i) => {
			obj.set({ left: obj.left! + offsetX, top: obj.top! + offsetY });
			obj.id = params.newObjectIds ? params.newObjectIds[i] : uuidv4();
			obj.setCoords();
		});

		drawObjects.beginBatch();
		try {
			c.add(...clonedObjects);
		} finally {
			drawObjects.endBatch();
		}
	});

	const clonedJsons = toJSON(clonedObjects); // history needs this — keep it

	if (!params.newObjectIds) {
		const newActiveObject =
			clonedObjects.length === 1
				? clonedObjects[0]
				: new ActiveSelection(clonedObjects, { canvas: c });
		newActiveObject.setCoords();
		c.setActiveObject(newActiveObject);
		c.clearContext(c.getTopContext());
		newActiveObject._renderControls(c.getTopContext());
	}

	c.fire("objectsCopied", {
		target: clonedJsons,
		objectIdsToClone: sources.map((o) => o.id),
		newObjectIds: clonedObjects.map((o) => o.id),
	});
}

export function mergeHelper(
	canvas: Canvas,
	objects: FabricObject[],
	groupId = uuidv4(),
): Group {
	const stack = (canvas as any)._objects as FabricObject[];
	const highestIndex = Math.max(...objects.map((obj) => stack.indexOf(obj)));

	const group = new Group(objects, {
		canvas: canvas,
		id: groupId,
	} as any);

	// Entering a group rewrites each child's transform into the group's plane but
	// leaves its cached `aCoords` in the world plane (fabric only refreshes nested
	// coords when `subTargetCheck` is on). Anything that measures a child after
	// this — the tile renderer's per-child cull above all — then gets a rect
	// offset by the group's centre. Refresh once here; the renderer also guards
	// itself, since groups arrive from history and sync too.
	group.setCoords();
	group.forEachObject((obj) => obj.setCoords());

	objects.forEach((obj) => canvas.remove(obj));

	const targetIndex = Math.max(0, highestIndex - objects.length + 1);
	canvas.insertAt(targetIndex, group);

	return group;
}

export async function mergeObjects(params: DrawActionParams[DrawAction.Merge]) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	const { isPublicLobby } = useDrawSyncer();
	if (isPublicLobby) {
		const { user } = useAuthStore();
		if (params.objects.some((o) => o.userId !== user?._id)) {
			const { toast } = useToast();
			toast("You can only merge your own drawings", { color: "warning" });
			return;
		}
	}

	const { actionWithoutEvents } = useDrawEventManager();

	let createdGroup: Group | undefined;
	await actionWithoutEvents(async () => {
		c.discardActiveObject();
		createdGroup = mergeHelper(c, params.objects);
	});

	if (!createdGroup) return;

	c.setActiveObject(createdGroup);
	c.clearContext(c.getTopContext());
	createdGroup._renderControls(c.getTopContext());

	c.fire("objectsMerged", {
		objectIds: [createdGroup.id],
		group: null,
		mergedObjectIds: toObjectsIds(params.objects),
	});
}

export async function flipXObjects(params: DrawActionParams[DrawAction.FlipX]) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	const objects = params.objects;

	if (objects.length === 1) {
		objects[0].set("flipX", !objects[0].flipX);
		objects[0].setCoords();
	} else {
		const tempSelection = new fabric.ActiveSelection(objects, { canvas: c });

		const prevActiveObject = c.getActiveObject();
		c.setActiveObject(tempSelection);

		tempSelection.set("flipX", !tempSelection.flipX);
		tempSelection.setCoords();

		if (!params.setActiveObject) {
			c.discardActiveObject();
			if (prevActiveObject) c.setActiveObject(prevActiveObject);
		}
	}

	c.fire("flip", { direction: "flipX", target: objects });
}

export async function flipYObjects(params: DrawActionParams[DrawAction.FlipX]) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	const objects = params.objects;

	if (objects.length === 1) {
		objects[0].set("flipY", !objects[0].flipY);
		objects[0].setCoords();
	} else {
		const tempSelection = new fabric.ActiveSelection(objects, { canvas: c });

		const prevActiveObject = c.getActiveObject();
		c.setActiveObject(tempSelection);

		tempSelection.set("flipY", !tempSelection.flipY);
		tempSelection.setCoords();

		if (!params.setActiveObject) {
			c.discardActiveObject();
			if (prevActiveObject) c.setActiveObject(prevActiveObject);
		}
	}

	c.fire("flip", { direction: "flipY", target: objects });
}

export async function unselectObjects() {
	const { unSelect } = useSelect();
	unSelect();
}

export async function saveFabricObject(
	params: DrawActionParams[DrawAction.SaveFabricObject],
) {
	const { user } = useAuthStore();
	const drawui = useDrawUIStore();
	const shareToastStore = useShareToastStore();
	const { getCanvas } = useDrawStore();

	const c = getCanvas();
	if (!c || !user) return;

	drawui.isSavingDrawing = true;
	await new Promise((resolve) => setTimeout(resolve, 10));
	let tempCanvas: fabric.StaticCanvas | null = null;

	try {
		if (params.objects.length > 1) {
			c.discardActiveObject();
		}

		const bounds = computeBounds(params.objects, 0);

		// The canvas is only an object container for chunked JSON + the bounded
		// export helper below. Giving it the selection's WORLD dimensions creates a
		// physical backing store of width×height pixels; two far-apart objects could
		// therefore request a multi-gigabyte canvas and crash the WebView before the
		// export helper gets a chance to scale it down. Keep the backing store tiny —
		// object coordinates and serialization do not depend on canvas dimensions.
		const scratchCanvas = new fabric.StaticCanvas(undefined, {
			width: 1,
			height: 1,
			renderOnAddRemove: false,
		});
		tempCanvas = scratchCanvas;

		const clonedObjects = await Promise.all(
			params.objects.map((obj: fabric.Object) => obj.clone()),
		);

		clonedObjects.forEach((obj) => {
			obj.set({
				left: obj.left! - bounds.minX,
				top: obj.top! - bounds.minY,
				userId: user._id,
			});
			scratchCanvas.add(obj);
		});

		// 1. Chunked JSON & Image Generation
		scratchCanvas.backgroundColor = "transparent";
		const jsonObj = await generateChunkedJSON(scratchCanvas as any);
		const jsonString = JSON.stringify(jsonObj);

		const exportResult = await exportBoundingBoxImage(scratchCanvas as any, {
			maxSize: 1080,
			asBuffer: true,
			quality: 0.9,
		});

		if (!exportResult) throw new Error("Export failed");

		// 2. API Call
		const saved = await createSavedDrawing({
			_id: user._id,
			drawing: jsonString,
			img: exportResult.img,
		});

		shareToastStore.pushSavedToast({ saved });
	} catch (error) {
		console.error("Save failed:", error);
	} finally {
		// Explicitly release cloned objects and the native backing store. Relying on
		// GC here caused repeated saves to stack canvas memory on mobile.
		try {
			tempCanvas?.dispose();
		} catch {
			/* cleanup must not leave the save UI stuck */
		}
		try {
			if (params.objects.length > 1) {
				c.setActiveObject(
					new fabric.ActiveSelection(params.objects, { canvas: c }),
				);
			}
		} finally {
			drawui.isSavingDrawing = false;
		}
	}
}

export async function addSavedFabricObjectToCanvas(
	params: DrawActionParams[DrawAction.AddSavedDrawingToCanvas],
) {
	const { user } = useAuthStore(); // Access the active user
	const { getCanvas } = useDrawStore();
	const { selectTool, selectedTool } = useToolSelection();
	const { actionWithoutEvents } = useDrawEventManager();
	const drawObjects = useDrawObjectManager();
	const drawui = useDrawUIStore();

	const c = getCanvas();
	if (!c) return;
	drawui.isLoadingDrawing = true;

	try {
		let jsonData = params.json;

		if (typeof params.json === "string") {
			const response = await fetch(params.json);
			jsonData = await response.json();
		}

		const objects: fabric.Object[] = [];

		await enlivenObjectsTimeSlivered(jsonData.objects, (obj) => {
			const migrated = migrateLegacyOrigin(obj);
			migrated.set({
				id: uuidv4(),
				userId: user?._id || migrated.get("userId"),
			});
			objects.push(migrated);
		});

		const fitToViewport = (
			obj: fabric.Object,
			canvas: fabric.Canvas,
			padding = 0.8,
		) => {
			const zoom = canvas.getZoom();

			const viewportWidth = canvas.getWidth() / zoom;
			const viewportHeight = canvas.getHeight() / zoom;

			const objWidth = obj.getScaledWidth();
			const objHeight = obj.getScaledHeight();

			const maxWidth = viewportWidth * padding;
			const maxHeight = viewportHeight * padding;

			const widthScale = maxWidth / objWidth;
			const heightScale = maxHeight / objHeight;

			const scale = Math.min(widthScale, heightScale);

			// Only shrink, never enlarge
			if (scale < 1) {
				obj.scale(obj.scaleX! * scale);
			}

			obj.setCoords();
		};

		await actionWithoutEvents(async () => {
			drawObjects.beginBatch();
			try {
				if (objects.length === 1) {
					const obj = objects[0];

					fitToViewport(obj, c);

					centerObjectInViewport(c, obj);
					c.add(obj);

					obj.setCoords();
					c.setActiveObject(obj);
				} else if (objects.length > 1) {
					const selection = new fabric.ActiveSelection(objects, {
						canvas: c,
					});

					fitToViewport(selection, c);

					centerObjectInViewport(c, selection);

					selection.forEachObject((obj) => {
						c.add(obj);
						obj.setCoords();
					});

					selection.removeAll();
				}
			} finally {
				drawObjects.endBatch();
			}
		});

		// object:added was intentionally detached above, so explicitly seed the
		// custom renderer's quadtree, worker mirror, overview and tile invalidation.
		// Otherwise Fabric can show the active selection, but zooming redraws from
		// an index that does not contain these saved objects and they disappear.
		drawObjects.registerAddedObjects(objects);

		if (selectedTool !== DrawTool.Select) {
			selectTool(DrawTool.Select);
		}

		c.fire("objects:added", {
			target: objects,
		});

		if (objects.length === 1) {
			c.setActiveObject(objects[0]);
		} else if (objects.length > 1) {
			c.setActiveObject(
				new fabric.ActiveSelection(objects, {
					canvas: c,
				}),
			);
		}
	} catch (error) {
		console.error("Failed to load saved drawing:", error);
	} finally {
		drawui.isLoadingDrawing = false;
	}
}
