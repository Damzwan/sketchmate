import type { FabricImage, FabricObject } from "fabric";
import type { Shape } from "@/draw/tools/tool.types";

export enum DrawAction {
	FullErase,
	SetPropertiesOfObject,
	CopyObject,
	AddText,
	Merge,
	RemoveSelectedObjects,
	ChangeFont,
	SetObjectFillColor,
	SetObjectBackgroundColor,
	SetObjectStrokeColor,
	ChangeFontWeight,
	ChangeFontStyle,
	ChangeTextAlign,
	MoveObjectToFront,
	MoveObjectToBack,
	MoveObjectUpOneLayer,
	MoveObjectDownOneLayer,
	SetCanvasBackground,
	ChangeStrokeWidth,
	FlipX,
	FlipY,
	Undo,
	Redo,
	UnselectObjects,
	ExitColorPickerMode,
	ExitTextAddingMode,
	AddImage,
	AddSavedDrawingToCanvas,
	SaveFabricObject,
	AddShape,
	ConfirmShapeCreation,
	AddImgFilter,
}

interface DrawActionObjectParams {
	objects: FabricObject[];
}

export type DrawActionParams = {
	[DrawAction.FullErase]: undefined;
	[DrawAction.SetPropertiesOfObject]: DrawActionObjectParams & {
		properties: any;
	};
	[DrawAction.CopyObject]: DrawActionObjectParams & { newObjectIds?: string[] };
	[DrawAction.AddText]: undefined;
	[DrawAction.Merge]: DrawActionObjectParams;
	[DrawAction.RemoveSelectedObjects]: undefined;
	[DrawAction.ChangeFont]: { font: string };
	[DrawAction.SetObjectFillColor]: { color: string | undefined };
	[DrawAction.SetObjectBackgroundColor]: { color: string | undefined };
	[DrawAction.SetObjectStrokeColor]: { color: string | undefined };
	[DrawAction.ChangeFontWeight]: { weight: string };
	[DrawAction.ChangeFontStyle]: { fontStyle: string };
	[DrawAction.ChangeTextAlign]: { align: string };
	[DrawAction.MoveObjectToFront]: DrawActionObjectParams;
	[DrawAction.MoveObjectToBack]: DrawActionObjectParams;
	[DrawAction.MoveObjectUpOneLayer]: DrawActionObjectParams;
	[DrawAction.MoveObjectDownOneLayer]: DrawActionObjectParams;
	[DrawAction.SetCanvasBackground]: { color: string };
	[DrawAction.ChangeStrokeWidth]: { strokeWidth: number };
	[DrawAction.FlipX]: DrawActionObjectParams & { setActiveObject?: boolean };
	[DrawAction.FlipY]: DrawActionObjectParams & { setActiveObject?: boolean };
	[DrawAction.Undo]: undefined;
	[DrawAction.Redo]: undefined;
	[DrawAction.UnselectObjects]: undefined;
	[DrawAction.ExitColorPickerMode]: { lastSelectedObjectRef?: FabricObject };
	[DrawAction.ExitTextAddingMode]: undefined;
	[DrawAction.AddImage]: { imageUrl: string };
	[DrawAction.AddSavedDrawingToCanvas]: { json: any };
	[DrawAction.SaveFabricObject]: DrawActionObjectParams;
	[DrawAction.AddShape]: { shape: Shape };
	[DrawAction.ConfirmShapeCreation]: undefined;
	[DrawAction.AddImgFilter]: {
		filter: any;
		image: FabricImage;
		remove: boolean;
	};
};
