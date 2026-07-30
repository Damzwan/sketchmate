import {
	HistoryAction,
	HistoryEvent,
	HistoryParams,
} from "@/draw/history/history.types";
import {
	redoFlipX,
	redoFlipY,
	redoMerge,
	redoObjectAdded,
	redoObjectModified,
	redoObjectsAdded,
	redoObjectsCopied,
	redoObjectsDeleted,
	redoObjectStyle,
	undoFlipX,
	undoFlipY,
	undoMerge,
	undoObjectAdded,
	undoObjectModified,
	undoObjectsAdded,
	undoObjectsCopied,
	undoObjectsDeleted,
	undoObjectStyle,
} from "@/draw/history/operations/objectHistory";
import { redoErased, undoErased } from "@/draw/history/operations/eraseHistory";
import {
	redoMoveObjectsDownOneLayer,
	redoMoveObjectsToBack,
	redoMoveObjectsToFront,
	redoMoveObjectsUpOneLayer,
	undoMoveObjectsDownOneLayer,
	undoMoveObjectsToBack,
	undoMoveObjectsToFront,
	undoMoveObjectsUpOneLayer,
} from "@/draw/history/operations/layerHistory";
import {
	redoPolygonCreation,
	undoPolygonCreation,
} from "@/draw/history/operations/shapeHistory";
import {
	redoImgFilter,
	undoImgFilter,
} from "@/draw/history/operations/imageHistory";
import {
	redoChangeBackgroundColor,
	redoFullErase,
	undoChangeBackgroundColor,
	undoFullErase,
} from "@/draw/history/operations/canvasHistory";
import {
	redoTextChanged,
	redoTextStyleChanged,
	undoTextChanged,
	undoTextStyleChanged,
} from "@/draw/history/operations/textHistory";
import { Canvas, FabricObject } from "fabric";

export interface HistoryContext {
	canvas: Canvas;
	getObjectById: (id: string) => FabricObject | undefined;
	getObjectsById: (ids: string[]) => FabricObject[];
	updateQuadTree: (obj: FabricObject) => void;
	unSelect: () => void;
	/**
	 * Stroke ids of erases that are currently UNDONE — i.e. every Erasing action
	 * sitting on the redo stack.
	 *
	 * An object deleted by the fully-erased sweep is restored from a JSON
	 * snapshot taken at deletion time, and that snapshot carries whatever clip it
	 * had THEN. If a later erase has since been undone, restoring the snapshot
	 * silently re-applies it. Handlers that revive objects must strip these.
	 *
	 * Supplied through the context rather than imported: the history store owns
	 * the stacks, and an operation module importing it back would be a cycle.
	 */
	undoneEraseStrokeIds: () => Set<string>;
}

export type HistoryHandler<K extends HistoryEvent> = (
	ctx: HistoryContext,
	action: HistoryAction<K>,
) => Promise<HistoryAction<K>>;

export const undoActionMapping: {
	[K in HistoryEvent]: HistoryHandler<K>;
} = {
	[HistoryEvent.ObjectAdded]: undoObjectAdded,
	[HistoryEvent.ObjectsAdded]: undoObjectsAdded, // TODO unify with ObjectAdded if needed
	[HistoryEvent.ObjectModified]: undoObjectModified,
	[HistoryEvent.Erasing]: undoErased,
	[HistoryEvent.FullErase]: undoFullErase,
	[HistoryEvent.MoveObjectToFront]: undoMoveObjectsToFront,
	[HistoryEvent.MoveObjectToBack]: undoMoveObjectsToBack,
	[HistoryEvent.MoveObjectDownOneLayer]: undoMoveObjectsDownOneLayer,
	[HistoryEvent.MoveObjectUpOneLayer]: undoMoveObjectsUpOneLayer,
	[HistoryEvent.FlipX]: undoFlipX,
	[HistoryEvent.FlipY]: undoFlipY,
	[HistoryEvent.ObjectsCopied]: undoObjectsCopied,
	[HistoryEvent.ObjectsDeleted]: undoObjectsDeleted,
	[HistoryEvent.BackgroundColorChanged]: undoChangeBackgroundColor,
	[HistoryEvent.TextChanged]: undoTextChanged,
	[HistoryEvent.TextStyleChanged]: undoTextStyleChanged,
	[HistoryEvent.PolygonCreation]: undoPolygonCreation,
	[HistoryEvent.ObjectStyleChanged]: undoObjectStyle,
	[HistoryEvent.ImgFilterChanged]: undoImgFilter,
	[HistoryEvent.Merge]: undoMerge,
};

export const redoActionMapping: {
	[K in HistoryEvent]: HistoryHandler<K>;
} = {
	[HistoryEvent.ObjectAdded]: redoObjectAdded,
	[HistoryEvent.ObjectsAdded]: redoObjectsAdded,
	[HistoryEvent.ObjectModified]: redoObjectModified,
	[HistoryEvent.Erasing]: redoErased,
	[HistoryEvent.FullErase]: redoFullErase,
	[HistoryEvent.MoveObjectToFront]: redoMoveObjectsToFront,
	[HistoryEvent.MoveObjectToBack]: redoMoveObjectsToBack,
	[HistoryEvent.MoveObjectDownOneLayer]: redoMoveObjectsDownOneLayer,
	[HistoryEvent.MoveObjectUpOneLayer]: redoMoveObjectsUpOneLayer,
	[HistoryEvent.FlipX]: redoFlipX,
	[HistoryEvent.FlipY]: redoFlipY,
	[HistoryEvent.ObjectsCopied]: redoObjectsCopied,
	[HistoryEvent.ObjectsDeleted]: redoObjectsDeleted,
	[HistoryEvent.BackgroundColorChanged]: redoChangeBackgroundColor,
	[HistoryEvent.TextChanged]: redoTextChanged,
	[HistoryEvent.TextStyleChanged]: redoTextStyleChanged,
	[HistoryEvent.PolygonCreation]: redoPolygonCreation,
	[HistoryEvent.ObjectStyleChanged]: redoObjectStyle,
	[HistoryEvent.ImgFilterChanged]: redoImgFilter,
	[HistoryEvent.Merge]: redoMerge,
};
