import * as fabric from "fabric";
import { Canvas, FabricObject, Point } from "fabric";
import { isMobile } from "@/helper/general.helper";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { storeToRefs } from "pinia";
import { DrawTool } from "@/draw/tools/tool.types";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { useSelect } from "@/draw/tools/select.store";
import { gestureDetector } from "@/draw/utils/gestureDetector";
import { cancelPreviousAction } from "@/draw/tools/cancelTools";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useGestureStore } from "@/draw/tools/gesture.store";
import * as transform from "@/draw/transform/transformController";

function zoomLimits() {
	return useDrawObjectManager().getZoomLimits();
}
let visibilityTimeout: any = null;
const SETTLE_DELAY = 180;

// --- VIEWPORT SCHEDULER ---
let viewportFrameScheduled = false;
let viewportRafId: number | null = null;

function scheduleViewportUpdate(c: Canvas, postRenderCallback?: () => void) {
	if (viewportFrameScheduled) return;
	viewportFrameScheduled = true;
	viewportRafId = requestAnimationFrame(() => {
		viewportRafId = null;
		viewportFrameScheduled = false;
		syncVisuals(c);
		if (postRenderCallback) postRenderCallback();
	});
}

export function destroyGestures(): void {
	clearTimeout(visibilityTimeout);
	visibilityTimeout = null;
	if (viewportRafId !== null) cancelAnimationFrame(viewportRafId);
	viewportRafId = null;
	viewportFrameScheduled = false;
}

function cancelPendingSettle() {
	clearTimeout(visibilityTimeout);
}

function syncVisuals(c: Canvas) {
	// renderViewportNow, NOT renderViewport. We are already inside a RAF callback
	// here, and renderViewport() only *schedules* another one — so the composite
	// for this gesture frame landed on the NEXT frame, putting every pan and zoom
	// two frames behind the finger with no CPU cost involved at all.
	const { renderViewportNow } = useDrawObjectManager();
	renderViewportNow();

	const { recalculateAvatarPositions } = useDrawUIStore();
	recalculateAvatarPositions();
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
	}, SETTLE_DELAY);
}

// ─── PC Interaction ─────────────────────────────────────────────────────────

export function enablePCGestures(c: Canvas) {
	const gestureStore = useGestureStore();
	const { addEventsOfService } = useDrawEventManager();
	const { onGestureStart } = useDrawObjectManager();
	let limits = zoomLimits();

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
					cancelPendingSettle();
					isWheeling = true;
					limits = zoomLimits();
					onGestureStart();
					gestureStore.isGesturing = true;
					c.fire("gestureStart");
				}

				const rawZoomFactor = Math.exp(-e.deltaY / 300);
				let newZoom = Math.max(
					limits.min,
					Math.min(c.getZoom() * rawZoomFactor, limits.max),
				);

				// Logical update is instant
				c.zoomToPoint(new Point(e.offsetX, e.offsetY), newZoom);

				// Visual paint & event dispatch are throttled
				scheduleViewportUpdate(c, () => c.fire("zoomChanged"));

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

				cancelPendingSettle();

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

				// Logical matrix update is instant
				const vpt = c.viewportTransform!;
				vpt[4] += dx;
				vpt[5] += dy;
				c.setViewportTransform(vpt);

				// Visual paint is throttled
				scheduleViewportUpdate(c);
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

	let isActiveObjectGesture = false;
	let gestureTarget: FabricObject | null = null;
	let gestureOriginalState: any = null;

	let isCanvasZooming = false;
	let isObjectScaling = false;
	let totalObjectAngleDelta = 0;
	let gestureFrameScheduled = false;
	let limits = zoomLimits();

	function scheduleObjectUpdate() {
		if (gestureFrameScheduled || !gestureTarget) return;
		gestureFrameScheduled = true;
		requestAnimationFrame(() => {
			gestureFrameScheduled = false;
			if (!gestureTarget || !gestureOriginalState) return;

			const newAngle =
				(gestureOriginalState.angle + totalObjectAngleDelta) % 360;
			gestureTarget.set("angle", newAngle);
			gestureTarget.setCoords();

			if (transform.isActive()) {
				transform.markMoved();
				transform.schedule();
			}
		});
	}

	gestureDetector(upperCanvasEl, {
		onGestureStart: () => {
			isCanvasZooming = false;
			isObjectScaling = false;
			totalObjectAngleDelta = 0;
			isActiveObjectGesture = false;

			if (shapeCreationMode.value) return;
			c.fire("gestureStart");

			if (
				selectedTool.value === DrawTool.Select &&
				shouldModifyObjectsWithGestures()
			) {
				const obj = c.getActiveObject();
				if (obj) {
					isActiveObjectGesture = true;
					gestureTarget = obj;

					if (c._currentTransform) {
						c._currentTransform = null;
					}

					gestureTarget.lockMovementX = gestureTarget.lockMovementY = true;

					gestureOriginalState = {
						left: obj.left,
						top: obj.top,
						scaleX: obj.scaleX,
						scaleY: obj.scaleY,
						angle: obj.angle,
					};

					if (!transform.isActive()) {
						transform.beginOrContinue(c, obj);
					}
					return;
				}
			}

			c.selection = false;
			c.skipTargetFind = true;
			c.isDrawingMode = false;
			cancelPreviousAction(c);
			limits = zoomLimits();
			cancelPendingSettle();
			onGestureStart();
			gestureStore.isGesturing = true;

			if (c._currentTransform) {
				c._currentTransform.target.setCoords();
				c._currentTransform = null;
			}
		},

		onDrag: (dx, dy) => {
			if (isActiveObjectGesture) return;

			// Logical matrix update is instant
			const vpt = c.viewportTransform!;
			vpt[4] += dx * 2;
			vpt[5] += dy * 2;
			c.setViewportTransform(vpt);

			// Visual paint is throttled
			scheduleViewportUpdate(c);
		},

		onZoom: (scale, previousScale, center) => {
			if (isActiveObjectGesture) {
				if (!isObjectScaling && Math.abs(1 - scale) > 0.03)
					isObjectScaling = true;
				if (!isObjectScaling || !gestureTarget) return;

				gestureTarget.set({
					scaleX: gestureOriginalState.scaleX * scale,
					scaleY: gestureOriginalState.scaleY * scale,
				});
				transform.markMoved();
				scheduleObjectUpdate();
				return;
			}

			if (!isCanvasZooming && Math.abs(1 - scale) > 0.03)
				isCanvasZooming = true;
			if (!isCanvasZooming) return;

			const rawZoomFactor = scale / previousScale;
			let newZoom = Math.max(
				limits.min,
				Math.min(c.getZoom() * rawZoomFactor, limits.max),
			);

			// Logical update is instant
			c.zoomToPoint(new Point(center.x, center.y), newZoom);

			// Visual paint is throttled
			scheduleViewportUpdate(c);
		},

		onRotate: (delta) => {
			if (!isActiveObjectGesture || !gestureTarget) return;
			totalObjectAngleDelta += delta;
			scheduleObjectUpdate();
		},

		onGestureEnd: () => {
			isCanvasZooming = false;
			isObjectScaling = false;

			if (isActiveObjectGesture) {
				const target = gestureTarget;
				const originalState = gestureOriginalState;

				isActiveObjectGesture = false;
				gestureTarget = null;
				gestureOriginalState = null;
				gestureStore.isGesturing = false;

				if (!target) return;

				target.setCoords();
				target.lockMovementX = target.lockMovementY = false;

				const moved = transform.moveHappened();

				if (transform.isActive()) transform.releaseDrag(c!);

				if (moved || totalObjectAngleDelta !== 0 || isObjectScaling) {
					c.fire("object:modified", {
						target: target,
						transform: {
							target: target,
							original: originalState,
						} as any,
					});
				}
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
