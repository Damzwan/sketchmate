import type { FabricObject, FabricObjectProps } from "fabric";
import type { DrawLayer } from "@/draw/layers/layer.types";

export enum HistoryEvent {
	ObjectAdded = "object:added",
	ObjectsAdded = "objects:added",
	ObjectsDeleted = "objectsDeleted",
	ObjectModified = "object:modified",
	Erasing = "erasing",
	FullErase = "fullErase",
	MoveObjectToFront = "moveObjectToFront",
	MoveObjectToBack = "moveObjectToBack",
	MoveObjectUpOneLayer = "moveObjectUpOneLayer",
	MoveObjectDownOneLayer = "moveObjectDownOneLayer",
	FlipX = "flipX",
	FlipY = "flipY",
	ObjectsCopied = "objectsCopied",
	BackgroundColorChanged = "backgroundColorChanged",
	TextChanged = "textChanged",
	TextStyleChanged = "textStyleChanged",
	PolygonCreation = "polygonCreation",
	ObjectStyleChanged = "objectStyleChanged",
	ImgFilterChanged = "imgFilterChanged",
	Merge = "merge",
	// Layer DOCUMENT edits. Solo drawing only — in a room the layer set is a
	// constant, so there is nothing structural to undo. Visibility and lock are
	// view state and deliberately absent here.
	LayerAdded = "layerAdded",
	LayerDeleted = "layerDeleted",
	LayerRenamed = "layerRenamed",
	LayerReordered = "layerReordered",
	LayerFlattened = "layerFlattened",
}

export type HistoryParamsMap = {
	[HistoryEvent.ObjectAdded]: { objectJSON: any };
	[HistoryEvent.ObjectsAdded]: {
		/** Present for normal eager history entries and after the first undo of a
		 * saved-object import. Bulk import initially records only objectIds. */
		objectsJSON?: any[];
		objectIds?: string[];
	};
	[HistoryEvent.ObjectsDeleted]: { objectsJSON: any[] };
	[HistoryEvent.ObjectModified]: {
		activeObjectId?: string | null;
		changes: {
			id: string;
			forward: Partial<FabricObjectProps>;
			backward: Partial<FabricObjectProps>;
		}[];
	};
	[HistoryEvent.Erasing]: {
		objectIds: string[];
		strokeId: string;
		strokeJSON: any;
		deletedObjectsJSON: any[];
	};
	[HistoryEvent.FullErase]: {
		objects: FabricObject[];
		previousBackgroundColor: string;
	};
	[HistoryEvent.MoveObjectToFront]: {
		objectIds: string[];
		prevObjectPositions: number[];
		prevZ?: number[];
	};
	[HistoryEvent.MoveObjectToBack]: {
		objectIds: string[];
		prevObjectPositions: number[];
		prevZ?: number[];
	};
	[HistoryEvent.MoveObjectUpOneLayer]: {
		objectIds: string[];
		prevObjectPositions: number[];
		prevZ?: number[];
	};
	[HistoryEvent.MoveObjectDownOneLayer]: {
		objectIds: string[];
		prevObjectPositions: number[];
		prevZ?: number[];
	};
	[HistoryEvent.FlipX]: { objectIds: string[] };
	[HistoryEvent.FlipY]: { objectIds: string[] };
	[HistoryEvent.ObjectsCopied]: { objectsJSON: any[] };
	[HistoryEvent.BackgroundColorChanged]: { previousColor: string };
	[HistoryEvent.TextChanged]: {
		objectId: string;
		prevText: string;
		newText: string;
	};
	[HistoryEvent.TextStyleChanged]: {
		objectId: string;
		prevStyle: any;
		newStyle: any;
	};
	[HistoryEvent.PolygonCreation]: { lastPoint: any };
	[HistoryEvent.ObjectStyleChanged]: {
		objectIds: string[];
		prevStyles: Record<string, any>;
		newStyles: Record<string, any> | null;
	};
	[HistoryEvent.ImgFilterChanged]: {
		objectId: string;
		prevFilter: any;
		newFilter: any;
		prevBlendColorFilter: any;
	};
	[HistoryEvent.Merge]: { group: any | undefined; objectIds: string[] };
	/** The layer record carries its own fractional `order`, so restoring it needs
	 *  no index — which is also what lets these replay in any order. */
	[HistoryEvent.LayerAdded]: { layer: DrawLayer };
	/** `objectsJSON` is a LAZY param (defineLazyJSON) — never enumerate-and-read
	 *  it casually, and keep `__w` precomputed on the action. */
	[HistoryEvent.LayerDeleted]: {
		layer: DrawLayer;
		objectsJSON: any[];
	};
	[HistoryEvent.LayerRenamed]: {
		layerId: string;
		previousName: string;
		name: string;
	};
	[HistoryEvent.LayerReordered]: {
		layerId: string;
		previousOrder: number;
		order: number;
	};
	/** Both payloads are recorded EAGERLY, unlike LayerDeleted: the flatten
	 *  already had to serialize the originals, and the rasters have to be kept
	 *  verbatim or a redo would re-encode to subtly different images.
	 *  `imagesJSON` is a GRID — a big layer tiles so every tile can hold full
	 *  render-scale pixels (see rasterizeObjectsToImages). */
	[HistoryEvent.LayerFlattened]: {
		layerId: string;
		objectsJSON: any[];
		imagesJSON: any[];
	};
};

export type HistoryParams<T extends HistoryEvent> = HistoryParamsMap[T];

export interface HistoryAction<T extends HistoryEvent = HistoryEvent> {
	type: T;
	params: HistoryParams<T>;
}
