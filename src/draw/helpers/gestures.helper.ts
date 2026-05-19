// src/draw/helpers/gestures.helper.ts
import * as fabric from "fabric";
import { Canvas, Point } from "fabric";
import { isMobile } from "@/helper/general.helper";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import { storeToRefs } from "pinia";
import { DrawTool, FabricEvent } from "@/draw/types/draw.types";
import { useSelect } from "@/draw/store/tools/select.store";
import { ref } from "vue";
import { gestureDetector } from "@/draw/utils/gestureDetector";
import { cancelPreviousAction } from "@/draw/helpers/tools/cancelTools.helper";
import { useDrawUIStore } from "@/draw/store/drawUI.store";
import { useToolSelection } from "@/draw/store/tools/toolSelection.store";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import {
	finalizeCssOverlay,
	isLayeredRenderActive,
	prepareCssOverlay,
	renderCssOverlay,
} from "@/draw/helpers/customTransform.helper";
import { useGestureStore } from "@/draw/store/tools/gesture.store";
import { MOVE_HAPPENED } from "@/draw/helpers/fabricDefaults.helper";

const MIN_ZOOM = 0.2;
let dynamicMinZoom = MIN_ZOOM;
let visibilityTimeout: any = null;

function getMinZoomToFitAll(canvas: fabric.Canvas, padding = 0.9) {
	const objects = canvas.getObjects();
	if (objects.length === 0) return 0.5;

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (let i = 0; i < objects.length; i++) {
		const bound = objects[i].getBoundingRect();
		if (bound.left < minX) minX = bound.left;
		if (bound.top < minY) minY = bound.top;
		if (bound.left + bound.width > maxX) maxX = bound.left + bound.width;
		if (bound.top + bound.height > maxY) maxY = bound.top + bound.height;
	}

	const contentWidth = maxX - minX;
	const contentHeight = maxY - minY;
	const scaleX = canvas.getWidth() / (contentWidth || 1);
	const scaleY = canvas.getHeight() / (contentHeight || 1);

	return Math.min(Math.min(scaleX, scaleY) * padding, MIN_ZOOM);
}

function syncVisuals(c: Canvas) {
	const { renderViewport } = useDrawObjectManager();
	renderViewport();
}

function endViewportGesture(c: Canvas) {
	const { onGestureEnd } = useDrawObjectManager();
	const gestureStore = useGestureStore();

	gestureStore.isGesturing = false;
	c.fire("gestureEnd");

	clearTimeout(visibilityTimeout);
	visibilityTimeout = setTimeout(() => {
		if (!gestureStore.isGesturing) {
			onGestureEnd();
		}
	}, 50);
}

// ─── PC Interaction ─────────────────────────────────────────────────────────

export function enablePCGestures(c: Canvas) {
	const gestureStore = useGestureStore();
	const { addEventsOfService } = useDrawEventManager();
	const { onGestureStart } = useDrawObjectManager();

	let isWheeling = false;
	let pcWheelTimeout: any = null;
	let panActive = false;
	let lastPanPoint: { x: number; y: number } | null = null;

	const events: FabricEvent[] = [
		{
			on: "mouse:wheel",
			handler: (o: any) => {
				const e = o.e;
				e.preventDefault();
				e.stopPropagation();

				if (!isWheeling) {
					isWheeling = true;
					dynamicMinZoom = getMinZoomToFitAll(c);
					onGestureStart();
					gestureStore.isGesturing = true;
					c.fire("gestureStart");
				}

				const rawZoomFactor = Math.exp(-e.deltaY / 300);
				let newZoom = Math.max(
					dynamicMinZoom,
					Math.min(c.getZoom() * rawZoomFactor, gestureStore.maxZoom),
				);

				c.zoomToPoint(new Point(e.offsetX, e.offsetY), newZoom);
				syncVisuals(c);
				c.fire("zoomChanged");

				clearTimeout(pcWheelTimeout);
				pcWheelTimeout = setTimeout(() => {
					isWheeling = false;
					endViewportGesture(c);
					c.fire("zoomChanged");
				}, 100);
			},
		},
		{
			on: "mouse:down",
			handler: (o: any) => {
				const e = o.e;
				if (e.buttons !== 4) return;

				panActive = true;
				lastPanPoint = { x: e.pageX, y: e.pageY };
				c.selection = false;
				c.skipTargetFind = true;

				onGestureStart();
				gestureStore.isGesturing = true;
				c.fire("gestureStart");

				e.preventDefault();
				e.stopPropagation();
			},
		},
		{
			on: "mouse:move",
			handler: (o: any) => {
				if (!panActive || !lastPanPoint) return;
				const e = o.e;
				const dx = e.pageX - lastPanPoint.x;
				const dy = e.pageY - lastPanPoint.y;
				lastPanPoint = { x: e.pageX, y: e.pageY };

				const vpt = c.viewportTransform!;
				vpt[4] += dx;
				vpt[5] += dy;
				c.setViewportTransform(vpt);
				syncVisuals(c);
			},
		},
		{
			on: "mouse:up",
			handler: (o: any) => {
				if (!panActive) return;
				panActive = false;
				lastPanPoint = null;

				const { selectedTool } = storeToRefs(useToolSelection());
				if (selectedTool.value === DrawTool.Select) {
					c.selection = true;
					c.skipTargetFind = false;
				}

				endViewportGesture(c);
				o.e.preventDefault();
				o.e.stopPropagation();
			},
		},
	];

	addEventsOfService("gestures", events);
}

// ─── Mobile Interaction ─────────────────────────────────────────────────────

export function enableMobileGestures(c: Canvas, upperCanvasEl: any) {
	const { selectedTool } = storeToRefs(useToolSelection());
	const { shapeCreationMode } = storeToRefs(useDrawUIStore());
	const { shouldModifyObjectsWithGestures } = useSelect();
	const { onGestureStart } = useDrawObjectManager();
	const gestureStore = useGestureStore();

	const isUsingGesture = ref(false);
	const gestureState = { originalObjectState: null as any | null };

	let isCanvasZooming = false;
	let isObjectScaling = false;
	let totalObjectAngleDelta = 0;
	let gestureFrameScheduled = false;

	function scheduleObjectUpdate() {
		if (gestureFrameScheduled) return;
		gestureFrameScheduled = true;
		requestAnimationFrame(() => {
			gestureFrameScheduled = false;
			const obj = c.getActiveObject();
			if (!obj || !gestureState.originalObjectState) return;
			obj.set(
				"angle",
				(gestureState.originalObjectState.angle + totalObjectAngleDelta) % 360,
			);
			obj.setCoords();
			if (isLayeredRenderActive) renderCssOverlay(c, obj);
		});
	}

	gestureDetector(upperCanvasEl, {
		onGestureStart: () => {
			isCanvasZooming = false;
			isObjectScaling = false;
			totalObjectAngleDelta = 0;
			if (shapeCreationMode.value) return;
			c.fire("gestureStart");

			if (
				selectedTool.value === DrawTool.Select &&
				shouldModifyObjectsWithGestures()
			) {
				const obj = c.getActiveObject();
				if (!obj) return;
				obj.lockMovementX = obj.lockMovementY = true;
				gestureState.originalObjectState = {
					left: obj.left,
					top: obj.top,
					scaleX: obj.scaleX,
					scaleY: obj.scaleY,
					angle: obj.angle,
				};
				isUsingGesture.value = true;
				gestureStore.isGesturing = true;
			} else {
				isUsingGesture.value = false;
				c.selection = false;
				c.skipTargetFind = true;
				c.isDrawingMode = false;
				cancelPreviousAction(c);
				dynamicMinZoom = getMinZoomToFitAll(c);
				onGestureStart();
				gestureStore.isGesturing = true;
			}
		},

		onDrag: (dx, dy) => {
			if (isUsingGesture.value) return;
			const vpt = c.viewportTransform!;
			vpt[4] += dx * 2;
			vpt[5] += dy * 2;
			c.setViewportTransform(vpt);
			syncVisuals(c);
		},

		onZoom: (scale, previousScale, center) => {
			if (isUsingGesture.value) {
				if (!isObjectScaling && Math.abs(1 - scale) > 0.03)
					isObjectScaling = true;
				if (!isObjectScaling) return;
				const obj = c.getActiveObject();
				if (obj && gestureState.originalObjectState) {
					obj.set({
						scaleX: gestureState.originalObjectState.scaleX * scale,
						scaleY: gestureState.originalObjectState.scaleY * scale,
					});
					scheduleObjectUpdate();
				}
				return;
			}

			if (!isCanvasZooming && Math.abs(1 - scale) > 0.03)
				isCanvasZooming = true;
			if (!isCanvasZooming) return;

			const rawZoomFactor = scale / previousScale;
			let newZoom = Math.max(
				dynamicMinZoom,
				Math.min(c.getZoom() * rawZoomFactor, gestureStore.maxZoom),
			);

			c.zoomToPoint(new Point(center.x, center.y), newZoom);
			syncVisuals(c);
		},

		onRotate: (delta) => {
			if (!isUsingGesture.value) return;
			totalObjectAngleDelta += delta;
			scheduleObjectUpdate();
		},

		onGestureEnd: () => {
			isCanvasZooming = false;
			isObjectScaling = false;

			if (isUsingGesture.value) {
				setTimeout(() => {
					const obj = c.getActiveObject();
					if (obj) {
						obj.setCoords();
						obj.lockMovementX = obj.lockMovementY = false;
						isUsingGesture.value = false;
						gestureStore.isGesturing = false;

						if (MOVE_HAPPENED) return;
						finalizeCssOverlay(c);
						c.fire("object:modified", {
							target: obj,
							transform: {
								target: obj,
								original: gestureState.originalObjectState,
							} as any,
						});
					}
				}, 50);
			} else {
				setTimeout(() => {
					if (selectedTool.value === DrawTool.Select) {
						c.selection = true;
						c.skipTargetFind = false;
					} else if (
						[DrawTool.Pen, DrawTool.MobileEraser].includes(selectedTool.value)
					) {
						c.isDrawingMode = true;
					}
				}, 50);
				endViewportGesture(c);
			}
		},
	});
}

export function enableGestures(c: Canvas) {
	if (isMobile()) enableMobileGestures(c, c.upperCanvasEl);
	else enablePCGestures(c);
}
