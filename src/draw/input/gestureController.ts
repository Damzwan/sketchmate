import type { Canvas, FabricObject } from "fabric";
import { getRenderDpr } from "../config/renderQuality.config";
import type { RenderEngine } from "../rendering/renderEngine";
import { minimumTiledZoom } from "../rendering/zoomLevels";
import {
	bakeryPauseFlush,
	bakeryTranslate,
	isBakeryActive,
} from "../rendering/bakery/tileBakeryClient";
import type { WorldRect } from "../rendering/committedLayer";
import * as transformLayer from "../transform/transformController";

interface GestureControllerOptions {
	getCanvas: () => Canvas | undefined;
	getEngine: () => RenderEngine<FabricObject> | null;
	isLowEndDevice: boolean;
}

export function createGestureController(options: GestureControllerOptions) {
	const engine = () => options.getEngine();

	function requestFrame() {
		engine()?.requestFrame();
	}

	function renderFrameNow() {
		engine()?.renderFrameNow();
	}

	function start() {
		const canvas = options.getCanvas();
		const renderEngine = engine();
		if (!canvas || !renderEngine) return;

		if (transformLayer.isActive()) transformLayer.commit(canvas);
		startTransform();
	}

	function startTransform() {
		const renderEngine = engine();
		if (!renderEngine) return;
		// The engine aborts local continuations before its remote cancellation
		// hook settles worker promises, preventing a compatibility render on main.
		renderEngine.setGesturing(true);
		bakeryPauseFlush(true);
	}

	function endTransform() {
		engine()?.setGesturing(false);
		bakeryPauseFlush(false);
	}

	function end() {
		endTransform();
	}

	function setErasing(active: boolean) {
		engine()?.setErasing(active);
	}

	function dropRegion(rect: WorldRect) {
		transformLayer.invalidateCache();
		engine()?.dropRegion(rect);
	}

	function dropRegionLight(
		rect: WorldRect,
		invalidateSelectionCache = false,
		coveredByLayer = false,
		maxSyncTiles?: number,
		repairOverviewNow = false,
	) {
		if (invalidateSelectionCache) transformLayer.invalidateCache();
		const syncTiles =
			maxSyncTiles ??
			(coveredByLayer && isBakeryActive() ? 0 : options.isLowEndDevice ? 4 : 8);
		engine()?.dropRegionLight(rect, syncTiles, repairOverviewNow);
	}

	function dropEraseRegion(rect: WorldRect, changedRect?: WorldRect) {
		transformLayer.invalidateCache();
		engine()?.invalidateChanged(
			changedRect ?? rect,
			changedRect ? rect : null,
			0,
			true,
		);
	}

	function commitEraseStamp(path: FabricObject, rect: WorldRect) {
		const renderEngine = engine();
		if (!renderEngine) return;
		transformLayer.invalidateCache();
		renderEngine.onErase(path, rect, true);
	}

	function stampRegionBitmap(
		rect: WorldRect,
		bitmap: ImageBitmap,
		matrix: [number, number, number, number, number, number],
	): boolean {
		return engine()?.stampRegionBitmap(rect, bitmap, matrix) ?? false;
	}

	function translateMirror(objects: FabricObject[], dx: number, dy: number) {
		if (dx === 0 && dy === 0) return;
		const ids = objects.flatMap((object) => (object.id ? [object.id] : []));
		bakeryTranslate(ids, dx, dy);
	}

	function getZoomLimits() {
		const renderEngine = engine();
		if (!renderEngine) {
			return { min: minimumTiledZoom(getRenderDpr()), max: 16 };
		}
		return { min: renderEngine.minZoom, max: renderEngine.maxZoom };
	}

	return {
		requestFrame,
		renderFrameNow,
		start,
		end,
		startTransform,
		endTransform,
		setErasing,
		dropRegion,
		dropRegionLight,
		dropEraseRegion,
		commitEraseStamp,
		stampRegionBitmap,
		translateMirror,
		getZoomLimits,
	};
}
