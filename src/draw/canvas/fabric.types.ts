import type { TEvent } from "fabric";
import type { DrawAction } from "@/draw/actions/drawAction.types";

declare module "fabric" {
	interface CanvasOptions {
		isDrawingMode?: boolean;
	}

	interface Canvas {
		version: number;
	}

	// to have the properties recognized on the instance and in the constructor
	interface FabricObject {
		id: string;
		erasable?: boolean;
		oldText?: string;
		layer: number;
		init?: boolean; // hacky property for text initialization
		visual?: boolean; // hacky property for shape creations
		isBucketFill?: boolean;
		insertedIndex?: number;
		userId: string;
	}

	// to have the properties typed in the exported object
	interface SerializedObjectProps {
		id?: string;
		erasable?: boolean;
		insertedIndex?: number;
		isBucketFill?: boolean;
	}

	interface BaseBrush {
		_reset: () => void;
	}

	interface CanvasEvents {
		"objects:changed": Partial<TEvent> & {
			target: FabricObject[];
			parameters: any;
		};

		"layer:changed": Partial<TEvent> & {
			target: FabricObject[];
			type: DrawAction;
			prevObjectPositions?: number[];
			prevZ?: number[];
		};

		fullErase: Partial<TEvent> & {
			objects: FabricObject[];
			previousBackgroundColor: string;
		};

		flip: Partial<TEvent> & {
			direction: "flipX" | "flipY";
			target: FabricObject[];
		};

		objectsCopied: Partial<TEvent> & {
			target: string[];
			objectIdsToClone: string[];
			newObjectIds: string[];
		};

		objectsMerged: Partial<TEvent> & {
			objectIds: string[];
			group: any; // TODO what is this,
			mergedObjectIds: string[];
		};

		objectsDeleted: Partial<TEvent> & {
			target: FabricObject[];
		};

		backgroundColorChanged: Partial<TEvent> & {
			previousColor: string;
			color: string;
		};

		textStyleChanged: Partial<TEvent> & {
			prevStyle: object;
			style: object;
			target: FabricObject[];
		};

		polygonCreation: Partial<TEvent> & {
			target: FabricObject;
		};

		"objects:added": Partial<TEvent> & {
			target: FabricObject[];
			deferHistorySnapshot?: boolean;
		};

		layerDocumentChanged: Partial<TEvent> & {
			op: import("@/draw/layers/layer.types").LayerOp;
		};
		objectStyleChanged: Partial<TEvent> & {
			target: FabricObject[];
			prevStyles: object[];
			style: object;
		};

		imgFilterChanged: Partial<TEvent> & {
			target: FabricObject;
			prevFilter: any;
			filter: any;
			prevBlendColorFilter?: any;
		};

		"viewport:changed": Partial<TEvent> & {};

		zoomReset: Partial<TEvent>;
		zoomChanged: Partial<TEvent>;
		gestureStart: Partial<TEvent>;
		gestureEnd: Partial<TEvent>;
		invalidateCanvas: Partial<TEvent>;
		"render:patchModifiedObject": Partial<TEvent>;

		undo: any;
		redo: any;
		"erasing:cleanup_done": any;
		/** Smudge could not sample the canvas — see SmudgeBrush._beginStroke. */
		"smudge:blocked": any;
	}
}
