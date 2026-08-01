import { IText } from "fabric";
import { HistoryAction, HistoryEvent } from "@/draw/history/history.types";
import { HistoryContext } from "@/draw/history/historyActions";
import { DrawSyncingEvent } from "@/draw/sync/sync.types";
import { toJSON } from "@/draw/objects/objectSerialization";
import { patchObjectsAppearance } from "@/draw/history/operations/objectHistory";

/**
 * Triggered after text editing is complete.
 * This determines if the text is new (ObjectAdded) or modified (TextChanged).
 */
export function handleTextModification(obj: any) {
	const oldText = obj._textBeforeEdit || "";
	return {
		type: HistoryEvent.TextChanged,
		params: {
			objectId: obj.id,
			prevText: oldText,
			newText: obj.text,
		},
	};
}

// TODO draw history and syncer are similar
// TODO hacky now
export function handleTextModificationSync(obj: any) {
	return {
		type: DrawSyncingEvent.TextChanged,
		params: {
			objectId: obj.id,
			newText: obj.text,
		},
	};
}

export async function undoTextChanged(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.TextChanged>,
): Promise<HistoryAction<HistoryEvent.TextChanged>> {
	const { canvas, getObjectById } = ctx;
	const textObject = getObjectById(action.params.objectId) as IText;

	let currentText = "";
	if (textObject) {
		currentText = textObject.text;
		textObject.set("text", action.params.prevText);
		// Undo/redo runs with fabric events suppressed, so nothing else will
		// invalidate the tiles this text is baked into.
		patchObjectsAppearance([textObject]);
	}

	return { ...action, params: { ...action.params, prevText: currentText } };
}

export async function redoTextChanged(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.TextChanged>,
): Promise<HistoryAction<HistoryEvent.TextChanged>> {
	const { canvas, getObjectById } = ctx;
	const textObject = getObjectById(action.params.objectId) as IText;

	let currentText = "";
	if (textObject) {
		currentText = textObject.text;
		textObject.set("text", action.params.prevText);
		// Undo/redo runs with fabric events suppressed, so nothing else will
		// invalidate the tiles this text is baked into.
		patchObjectsAppearance([textObject]);
	}

	return { ...action, params: { ...action.params, prevText: currentText } };
}

export async function undoTextStyleChanged(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.TextStyleChanged>,
): Promise<HistoryAction<HistoryEvent.TextStyleChanged>> {
	const { canvas, getObjectById } = ctx;
	const textObject = getObjectById(action.params.objectId) as any;
	const currentStyles: any = {};

	if (textObject) {
		Object.entries(action.params.prevStyle).forEach(([key, value]) => {
			// Capture current style before overriding
			currentStyles[key] = textObject[key];
			textObject.set(key as any, value);
		});

		// Font properties resize the text, so the committed tiles under it are
		// now wrong in BOTH directions — stale glyphs where it shrank, missing
		// glyphs where it grew. Without this the object mutates but the baked
		// raster never rebuilds, and the undo looks like it did nothing at all.
		patchObjectsAppearance([textObject]);
	}

	// Return a new object rather than modifying 'action'
	return {
		...action,
		params: {
			...action.params,
			prevStyle: currentStyles,
		},
	};
}

export async function redoTextStyleChanged(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.TextStyleChanged>,
): Promise<HistoryAction<HistoryEvent.TextStyleChanged>> {
	const { canvas, getObjectById } = ctx;
	const textObject = getObjectById(action.params.objectId) as any;
	const currentStyles: any = {};

	if (textObject) {
		Object.entries(action.params.prevStyle).forEach(([key, value]) => {
			// Capture current style before overriding
			currentStyles[key] = textObject[key];
			textObject.set(key as any, value);
		});

		// Font properties resize the text, so the committed tiles under it are
		// now wrong in BOTH directions — stale glyphs where it shrank, missing
		// glyphs where it grew. Without this the object mutates but the baked
		// raster never rebuilds, and the undo looks like it did nothing at all.
		patchObjectsAppearance([textObject]);
	}

	// Return a new object rather than modifying 'action'
	return {
		...action,
		params: {
			...action.params,
			prevStyle: currentStyles,
		},
	};
}
