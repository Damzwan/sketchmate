import type { FabricObject } from "fabric";
import type { ExplicitZIndex } from "../objects/indexing/zIndex";
import { markObjectMutated } from "../objects/objectSerialization";
import {
	bakeryClear,
	bakeryClipSet,
	bakeryMarkDirty,
} from "../rendering/bakery/tileBakeryClient";
import type { WorldRect } from "../rendering/committedLayer";
import type { RenderEngine } from "../rendering/renderEngine";
import * as transformLayer from "../transform/transformController";
import type { FabricEvent } from "./fabricEvent.types";

interface FabricEventBridgeOptions {
	getEngine: () => RenderEngine<FabricObject> | null;
	isLoading: () => boolean;
	isBatching: () => boolean;
	noteRegion: (rect: WorldRect) => void;
	objectBounds: (object: FabricObject) => WorldRect;
	unionRect: (a: WorldRect, b: WorldRect) => WorldRect;
	updateSpatialIndex: (object: FabricObject) => void;
	zIndex: ExplicitZIndex;
	onObjectAdded: (object: FabricObject) => void;
	onObjectRemoved: (object: FabricObject) => void;
	onObjectModified: (event: unknown) => void;
	onStyleChanged: (event: unknown) => void;
}

export function createFabricEventBridge(
	options: FabricEventBridgeOptions,
): FabricEvent[] {
	const styleEvent = (event: unknown) => options.onStyleChanged(event);

	return [
		{
			on: "object:added",
			handler: (event: any) => options.onObjectAdded(event.target),
		},
		{
			on: "object:removed",
			handler: (event: any) => options.onObjectRemoved(event.target),
		},
		{ on: "object:modified", handler: options.onObjectModified },
		{
			on: "fullErase",
			handler: () => {
				bakeryClear();
				options.getEngine()?.reset();
				options.getEngine()?.requestFrame();
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => {
				transformLayer.invalidateVacatedCache();
				options.getEngine()?.requestFrame();
			},
		},
		{ on: "invalidateCanvas", handler: styleEvent },
		{
			on: "render:patchModifiedObject",
			handler: (event: any) => patchModifiedObject(event, options),
		},
		{ on: "textStyleChanged", handler: styleEvent },
		{ on: "objectStyleChanged", handler: styleEvent },
		{ on: "imgFilterChanged", handler: styleEvent },
		{ on: "flip", handler: styleEvent },
		{
			on: "layer:changed",
			handler: (event: unknown) => {
				options.zIndex.invalidate();
				options.onStyleChanged(event);
			},
		},
		{
			on: "erasing:end",
			handler: (event: any) => handleEraseEnd(event, options),
		},
	];
}

function patchModifiedObject(
	event: any,
	options: FabricEventBridgeOptions,
): void {
	const object = event.target as FabricObject;
	const previous = event.oldRect;
	const engine = options.getEngine();
	if (!object || !previous || !engine) return;

	transformLayer.invalidateCache();
	options.updateSpatialIndex(object);
	if (options.isLoading()) return;

	const oldRect: WorldRect = {
		x: previous.x ?? previous.left,
		y: previous.y ?? previous.top,
		w: previous.w ?? previous.width,
		h: previous.h ?? previous.height,
	};
	if (options.isBatching()) {
		options.noteRegion(
			options.unionRect(options.objectBounds(object), oldRect),
		);
		return;
	}
	engine.onObjectChanged(object, oldRect);
}

function handleEraseEnd(event: any, options: FabricEventBridgeOptions): void {
	const engine = options.getEngine();
	if (options.isLoading() || !engine) return;

	const detail = event.detail ?? {};
	const path = detail.path as FabricObject | undefined;
	const rect = detail.dirtyRect as WorldRect | undefined;
	transformLayer.invalidateCache();

	const targets = (detail.targets ?? []) as FabricObject[];

	// An erase that clipped NOTHING changed no pixels, so there is nothing to
	// invalidate — a stroke over empty space, or over content the lobby/claim
	// rules protect. The brush still punched the live lower context while the
	// pointer was down, so ask for one repaint to restore it from the tiles.
	//
	// This used to be harmless: the stroke took the stamp path, punched
	// transparent pixels and left the tiles FRESH. Now that a cross-layer erase
	// correctly falls back to invalidate-and-re-render, the same no-op stroke
	// marked its whole footprint unusable and dropped it to the overview — the
	// "blur after erasing over nothing".
	if (targets.length === 0) {
		engine.requestFrame();
		return;
	}

	for (const target of targets) {
		if (!target?.id) continue;
		markObjectMutated(target);
		if ((target as any).__hasImageClip) bakeryMarkDirty(target);
		else bakeryClipSet(target);
	}

	if (options.isBatching()) {
		if (rect) options.noteRegion(rect);
		return;
	}

	const canStamp =
		!detail.selective &&
		(path as any)?.globalCompositeOperation === "destination-out";
	if (path && rect) engine.onErase(path, rect, canStamp);
	else if (rect) engine.markDirty(rect);
}
