import { DrawSyncingEvent, DrawSyncingParams } from "@/draw/sync/sync.types";
import * as fabric from "fabric";
import { FabricImage, FabricObject, IText } from "fabric";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { applyObjectModificationsBulk } from "@/draw/history/operations/objectHistory";
import { drawActionMapping } from "@/draw/actions/drawActions";
import { fullErase } from "@/draw/tools/eraseActions";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { setCanvasBackground } from "@/draw/tools/colorActions";
import {
	redoActionMapping,
	undoActionMapping,
} from "@/draw/history/historyActions";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { mergeHelper } from "@/draw/objects/objectActions";
import { eraseObject } from "@/draw/utils/brushes/CustomEraserBrush";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";

// TODO duplicate logic from history... think!
async function syncObjectsAdded(
	params: DrawSyncingParams<DrawSyncingEvent.added>,
) {
	const { getCanvas } = useDrawStore();

	const c = getCanvas();

	const objectsToRedo = params.objectJSONS;
	if (!objectsToRedo || objectsToRedo.length === 0) return;

	const enlivened =
		await fabric.util.enlivenObjects<FabricObject>(objectsToRedo);

	enlivened.forEach((enlivened, index) => {
		if (
			enlivened.insertedIndex !== undefined &&
			enlivened.insertedIndex !== null
		)
			c.insertAt(enlivened.insertedIndex, enlivened); // used for bucket fill
		else c.add(enlivened);
	});

	if (params.creator && enlivened.length > 0) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = enlivened[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncObjectsRemoved(
	params: DrawSyncingParams<DrawSyncingEvent.removed>,
) {
	const { getCanvas } = useDrawStore();
	const { getObjectsById } = useDrawObjectManager();
	const c = getCanvas();
	const objects = getObjectsById(params.objectIds);

	c.remove(...objects);

	if (params.creator && objects.length > 0) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncObjectsModified(
	params: DrawSyncingParams<DrawSyncingEvent.modified>,
) {
	const { getObjectById } = useDrawObjectManager();
	const { createHistoryContext } = useDrawHistoryManager();

	const bulkChanges = params.changes.map((c) => ({
		id: c.id,
		diff: c.backward,
	}));

	await applyObjectModificationsBulk(createHistoryContext(), bulkChanges);

	// 3. Update the collaborator's cursor/avatar position
	if (params.creator && params.changes.length > 0) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstChange = params.changes[0];
		const firstObj = getObjectById(firstChange.id);

		if (firstObj) {
			showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
		}
	}
}

async function syncFullErase() {
	fullErase(); // TODO select
}

// TODO duplicates...
async function syncMoveObjectToFront(
	params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.MoveObjectToFront]({ objects: objects });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncMoveObjectToBack(
	params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.MoveObjectToBack]({ objects: objects });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncMoveObjectDownOneLayer(
	params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.MoveObjectDownOneLayer]({
		objects: objects,
	});

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncMoveObjectUpOneLayer(
	params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.MoveObjectUpOneLayer]({
		objects: objects,
	});

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncFlipX(params: DrawSyncingParams<DrawSyncingEvent.FlipX>) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.FlipX]({ objects: objects });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncFlipY(params: DrawSyncingParams<DrawSyncingEvent.FlipY>) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.FlipY]({ objects: objects });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncObjectsCopied(
	params: DrawSyncingParams<DrawSyncingEvent.ObjectsCopied>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.objectIds);
	await drawActionMapping[DrawAction.CopyObject]({
		objects: objects,
		newObjectIds: params.newObjectIds,
	});

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = objects[0];
		showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
	}
}

async function syncBackgroundColorChanged(
	params: DrawSyncingParams<DrawSyncingEvent.BackgroundColorChanged>,
) {
	await setCanvasBackground({ color: params.color });
}

// TODO copy from history
async function syncTextStyleChanged(
	params: DrawSyncingParams<DrawSyncingEvent.TextStyleChanged>,
) {
	const { getObjectById } = useDrawObjectManager();
	const textObject = getObjectById(params.objectId) as any;

	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	const prevStyle: any = {};

	Object.entries(params.style).forEach(([key, value]) => {
		prevStyle[key] = textObject[key];
		textObject.set(key, value);
	});

	// @ts-ignore
	c.fire("textStyleChanged", { target: textObject });
}

async function syncObjectStyleChanged(
	params: DrawSyncingParams<DrawSyncingEvent.ObjectStyleChanged>,
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	const { getObjectsById } = useDrawObjectManager();

	const canvasObjects = getObjectsById(params.objectIds);

	canvasObjects.forEach((canvasObject) => {
		canvasObject.set(params.style);
	});

	// @ts-ignore
	c.fire("objectStyleChanged", { target: canvasObjects });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		const firstObj = canvasObjects[0];

		if (firstObj) {
			showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0);
		}
	}
}

async function syncImgFilterChanged(
	params: DrawSyncingParams<DrawSyncingEvent.ImgFilterChanged>,
) {
	const { getObjectById } = useDrawObjectManager();
	const img = getObjectById(params.objectId) as FabricImage;

	if (!params.filter) {
		img.filters?.pop();
	} else {
		const [filter] = await fabric.util.enlivenObjects<any>([params.filter]); // TODO typing
		if (filter.type == "BlendColor")
			img.filters = img.filters?.filter((f: any) => f.type != "BlendColor");
		img.filters?.push(filter);
	}

	img.applyFilters();

	const { getCanvas } = useDrawStore();
	const c = getCanvas();
	// @ts-ignore
	c.fire("imgFilterChanged", { target: img });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		showOrUpdateAvatar(params.creator, img.left || 0, img.top || 0);
	}
}

async function syncUndo(params: DrawSyncingParams<DrawSyncingEvent.Undo>) {
	const { createHistoryContext } = useDrawHistoryManager();
	await undoActionMapping[params.type](createHistoryContext(), params as any);
}

async function syncRedo(params: DrawSyncingParams<DrawSyncingEvent.Undo>) {
	const { createHistoryContext } = useDrawHistoryManager();
	await redoActionMapping[params.type](createHistoryContext(), params as any);
}

async function syncObjectsMerged(
	params: DrawSyncingParams<DrawSyncingEvent.ObjectsMerged>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById(params.mergedObjectIds);
	const { getCanvas } = useDrawStore();
	mergeHelper(getCanvas(), objects, params.groupId);
}

async function syncErasingEnd(
	params: DrawSyncingParams<DrawSyncingEvent.ErasingEnd>,
) {
	const { getObjectsById } = useDrawObjectManager();
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	const enlivenedPath = await fabric.util.enlivenObjects<fabric.Path>([
		params.erasePath,
	]);
	const newStroke = enlivenedPath[0];

	const objects = getObjectsById(params.objectIds);
	const deletedObjects = getObjectsById(params.deletedObjectIds || []);

	await Promise.all(
		objects.map(async (o) => {
			if (o) await eraseObject(o, newStroke);
			// @ts-ignore
			c.fire("invalidateCanvas", { target: o });
		}),
	);

	if (deletedObjects.length > 0) {
		c.remove(...deletedObjects);
	}

	if (params.creator && newStroke) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		showOrUpdateAvatar(params.creator, newStroke.left || 0, newStroke.top || 0);
	}
}

async function syncTextChanged(
	params: DrawSyncingParams<DrawSyncingEvent.TextChanged>,
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	const { getObjectsById } = useDrawObjectManager();
	const objects = getObjectsById([params.objectId]);
	const text = objects[0] as IText;
	text.set("text", params.newText);

	c.fire("object:modified", { target: text });

	if (params.creator) {
		const { showOrUpdateAvatar } = useDrawUIStore();
		showOrUpdateAvatar(params.creator, text.left || 0, text.top || 0);
	}
}

export const drawSyncingMapping: {
	[K in DrawSyncingEvent]: (
		params: DrawSyncingParams<K>,
	) => Promise<void> | void;
} = {
	[DrawSyncingEvent.added]: syncObjectsAdded,
	[DrawSyncingEvent.removed]: syncObjectsRemoved,
	[DrawSyncingEvent.modified]: syncObjectsModified,
	[DrawSyncingEvent.fullErase]: syncFullErase,
	[DrawSyncingEvent.MoveObjectToFront]: syncMoveObjectToFront,
	[DrawSyncingEvent.MoveObjectToBack]: syncMoveObjectToBack,
	[DrawSyncingEvent.MoveObjectDownOneLayer]: syncMoveObjectDownOneLayer,
	[DrawSyncingEvent.MoveObjectUpOneLayer]: syncMoveObjectUpOneLayer,
	[DrawSyncingEvent.FlipX]: syncFlipX,
	[DrawSyncingEvent.FlipY]: syncFlipY,
	[DrawSyncingEvent.ObjectsCopied]: syncObjectsCopied,
	[DrawSyncingEvent.BackgroundColorChanged]: syncBackgroundColorChanged,
	[DrawSyncingEvent.TextStyleChanged]: syncTextStyleChanged,
	[DrawSyncingEvent.ObjectStyleChanged]: syncObjectStyleChanged,
	[DrawSyncingEvent.ImgFilterChanged]: syncImgFilterChanged,
	[DrawSyncingEvent.Undo]: syncUndo,
	[DrawSyncingEvent.Redo]: syncRedo,
	[DrawSyncingEvent.ObjectsMerged]: syncObjectsMerged,
	[DrawSyncingEvent.ErasingEnd]: syncErasingEnd,
	[DrawSyncingEvent.TextChanged]: syncTextChanged,
};
