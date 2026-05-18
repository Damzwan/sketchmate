import { Canvas, FabricObject } from "fabric";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { useSmartBitmapManager } from "@/draw/composables/useSmartBitmapManager";
import { renderWithLOD } from "@/draw/helpers/Lodrenderer";
import { isMobile } from "@/helper/general.helper";

// ─── Constants ───────────────────────────────────────────────────────────────
const BITMAP_PADDING = 24;
const IS_MOBILE = isMobile();
const HW_CONCURRENCY = (navigator as any).hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && HW_CONCURRENCY <= 4;
const SELECTION_DOWNSAMPLE_AREA = 4_000_000;
const SELECTION_DOWNSAMPLE_FACTOR = 0.5;
const SELECTION_BUFFER_MAX_DIM = IS_LOW_END ? 4096 : IS_MOBILE ? 4096 : 8192;

// ─── State Management ────────────────────────────────────────────────────────
interface LayeredState {
	selectedObjects: FabricObject[];
	zoom: number;
	selectionOrigin: { left: number; top: number; width: number; height: number };
	originLeft: number;
	originTop: number;
	originScaleX: number;
	originScaleY: number;
	originAngle: number;
	selectionBufferFactor: number;
}

export let selectionState: LayeredState | null = null;
export let domOverlay: HTMLCanvasElement | null = null;
let cachedTargetSignature: string | null = null;

export let isLayeredRenderActive = false;
export let isSceneDirty = true;
const selectionBuffer = document.createElement("canvas");
const selCtx = selectionBuffer.getContext("2d")!;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resizeBuffer(buf: HTMLCanvasElement, w: number, h: number) {
	if (buf.width !== w || buf.height !== h) {
		buf.width = w;
		buf.height = h;
	}
}

function renderObjectFast(
	obj: FabricObject,
	ctx: CanvasRenderingContext2D,
	zoom: number,
) {
	const bitmapManager = useSmartBitmapManager();
	const bm = bitmapManager.getIfCompatible(obj.id, zoom);
	if (bm) {
		const b = bitmapManager.getBounds(obj);
		ctx.drawImage(
			bm,
			b.left - BITMAP_PADDING,
			b.top - BITMAP_PADDING,
			b.width + BITMAP_PADDING * 2,
			b.height + BITMAP_PADDING * 2,
		);
	} else {
		renderWithLOD(obj, ctx, zoom);
	}
}

// ─── Baking Logic ────────────────────────────────────────────────────────────
function bakeSelectionBuffer(
	c: Canvas,
	selectedObjects: FabricObject[],
	zoom: number,
) {
	const visibleObjects = selectedObjects.filter((o) => o.visible !== false);
	if (visibleObjects.length === 0) return null;

	// @ts-ignore
	const rects = visibleObjects.map((o) => o.getBoundingRect(true, true));
	const minX = Math.min(...rects.map((r) => r.left)) - 8;
	const minY = Math.min(...rects.map((r) => r.top)) - 8;
	const maxX = Math.max(...rects.map((r) => r.left + r.width)) + 8;
	const maxY = Math.max(...rects.map((r) => r.top + r.height)) + 8;

	const worldW = maxX - minX;
	const worldH = maxY - minY;
	if (worldW <= 0 || worldH <= 0) return null;

	const retina = c.getRetinaScaling();
	let factor = 1;
	let physW = Math.ceil(worldW * zoom * retina);
	let physH = Math.ceil(worldH * zoom * retina);

	if (physW * physH > SELECTION_DOWNSAMPLE_AREA) {
		factor = SELECTION_DOWNSAMPLE_FACTOR;
		physW *= factor;
		physH *= factor;
	}

	while (
		(physW > SELECTION_BUFFER_MAX_DIM || physH > SELECTION_BUFFER_MAX_DIM) &&
		factor > 0.1
	) {
		factor *= 0.5;
		physW *= 0.5;
		physH *= 0.5;
	}

	resizeBuffer(selectionBuffer, physW, physH);
	selCtx.resetTransform();
	selCtx.clearRect(0, 0, physW, physH);
	selCtx.scale(retina * zoom * factor, retina * zoom * factor);
	selCtx.translate(-minX, -minY);

	const zMap = useDrawObjectManager().getZIndexMap();
	visibleObjects.sort((a, b) => (zMap.get(a) ?? 0) - (zMap.get(b) ?? 0));
	visibleObjects.forEach((obj) => renderObjectFast(obj, selCtx, zoom));

	return {
		bbox: { left: minX, top: minY, width: worldW, height: worldH },
		factor,
	};
}

// ─── Overlay Management ──────────────────────────────────────────────────────
export function prepareCssOverlay(c: Canvas, target: FabricObject) {
	const zoom = c.viewportTransform?.[0] ?? 1;
	const selectedObjects =
		target.type === "activeselection"
			? [...(target as any)._objects]
			: [target];

	const currentSignature =
		selectedObjects
			.map((o) => o.id)
			.sort()
			.join(",") +
		`_z${zoom}_sx${target.scaleX ?? 1}_sy${target.scaleY ?? 1}_a${target.angle ?? 0}_l${target.left ?? 0}_t${target.top ?? 0}`;
	const baked =
		currentSignature === cachedTargetSignature &&
		!isSceneDirty &&
		selectionState
			? {
					bbox: selectionState.selectionOrigin,
					factor: selectionState.selectionBufferFactor,
				}
			: bakeSelectionBuffer(c, selectedObjects, zoom);

	if (!baked) return;

	if (currentSignature !== cachedTargetSignature) {
		cachedTargetSignature = currentSignature;
		isSceneDirty = false;
	}

	selectedObjects.forEach((obj) => {
		(obj as any)._preDragOpacity = obj.opacity;
		obj.opacity = 0;
	});

	c.fire("invalidateCanvas", { target: selectedObjects } as any);
	useDrawObjectManager().flushDirtyBatch(true);

	domOverlay = selectionBuffer;
	domOverlay.style.cssText = `position:absolute; pointer-events:none; transform:none;`;
	domOverlay.style.width = `${baked.bbox.width * zoom}px`;
	domOverlay.style.height = `${baked.bbox.height * zoom}px`;
	domOverlay.style.transformOrigin = `${(target.left! - baked.bbox.left) * zoom}px ${(target.top! - baked.bbox.top) * zoom}px`;
	domOverlay.style.left = `${baked.bbox.left * zoom + c.viewportTransform![4]}px`;
	domOverlay.style.top = `${baked.bbox.top * zoom + c.viewportTransform![5]}px`;

	c.wrapperEl.appendChild(domOverlay);

	selectionState = {
		selectedObjects,
		zoom,
		selectionOrigin: baked.bbox,
		originLeft: target.left ?? 0,
		originTop: target.top ?? 0,
		originScaleX: target.scaleX ?? 1,
		originScaleY: target.scaleY ?? 1,
		originAngle: target.angle ?? 0,
		selectionBufferFactor: baked.factor,
	};

	isLayeredRenderActive = true;
}

export function renderCssOverlay(c: Canvas, movingObject: FabricObject) {
	if (!selectionState || !domOverlay) return;
	const zoom = c.viewportTransform?.[0] ?? 1;
	const dx = ((movingObject.left ?? 0) - selectionState.originLeft) * zoom;
	const dy = ((movingObject.top ?? 0) - selectionState.originTop) * zoom;
	const sx = (movingObject.scaleX ?? 1) / selectionState.originScaleX;
	const sy = (movingObject.scaleY ?? 1) / selectionState.originScaleY;
	const currentAngle = movingObject.angle ?? 0;
	const originAngle = selectionState.originAngle;

	domOverlay.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${currentAngle}deg) scale(${sx}, ${sy}) rotate(${-originAngle}deg)`;
	c.clearContext(c.getTopContext());
	movingObject._renderControls(c.getTopContext());
}

export function finalizeCssOverlay(c: Canvas) {
	if (!isLayeredRenderActive) return;
	if (domOverlay?.parentNode) domOverlay.parentNode.removeChild(domOverlay);

	selectionState?.selectedObjects.forEach((obj) => {
		obj.opacity = (obj as any)._preDragOpacity ?? 1;
		delete (obj as any)._preDragOpacity;
	});

	c.fire("invalidateCanvas", {
		target: selectionState?.selectedObjects,
	} as any);
	isLayeredRenderActive = false;
	selectionState = null;
	domOverlay = null;
}
