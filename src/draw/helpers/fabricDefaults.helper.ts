import * as fabric from "fabric";
import {
	Canvas,
	CanvasOptions,
	classRegistry,
	FabricObject,
	IText,
	Point,
	TPointerEvent,
} from "fabric";
import { v4 as uuidv4 } from "uuid";
import { BACKGROUND } from "@/draw/config/canvas.config";
import { useAuthStore } from "@/store/auth.store";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { Rect } from "@/draw/utils/QuadTree";

// Brush Imports
import { PixelStroke } from "@/draw/utils/brushes/PixelBrush";
import { CharcoalStroke } from "@/draw/utils/brushes/CharcoalBrush";
import { WaterColorStroke } from "@/draw/utils/brushes/WaterColorBrush";
import { CalligraphyStroke } from "@/draw/utils/brushes/CalligraphyBrush";
import { CircleStroke } from "@/draw/utils/brushes/CustomCircleBrush";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import {
	finalizeCssOverlay,
	isLayeredRenderActive,
	prepareCssOverlay,
	renderCssOverlay,
} from "@/draw/helpers/customTransform.helper";
import { useToast } from "@/service/toast.service";
import { useGestureStore } from "@/draw/store/tools/gesture.store";

export function changeFabricSettings() {
	FabricObject.prototype.objectCaching = false;
	FabricObject.customProperties = [
		"id",
		"erasable",
		"oldText",
		"isBucketFill",
		"insertedIndex",
		"userId",
	];
	(FabricObject as any).ownDefaults!["erasable"] = true;

	// Register Brushes
	const brushes = [
		[OptimizedEraserStroke, "OptimizedEraserStroke"],
		[PixelStroke, "PixelStroke"],
		[CharcoalStroke, "CharcoalStroke"],
		[WaterColorStroke, "WaterColorStroke"],
		[CalligraphyStroke, "CalligraphyStroke"],
		[BucketFillPath, "BucketFillPath"],
		[OptimizedPencilStroke, "OptimizedPencilStroke"],
	] as const;
	brushes.forEach(([cls, name]) => classRegistry.setClass(cls, name));
	classRegistry.setClass(CircleStroke, CircleStroke.type);

	// Canvas Prototype Overrides
	const injectMeta = (obj: any) => {
		if (!obj.id) obj.id = uuidv4();
		if (!obj.userId) obj.userId = useAuthStore().user?._id;
	};

	const originalAdd = Canvas.prototype.add;
	Canvas.prototype.add = function (...objs: any[]) {
		objs.forEach(injectMeta);
		return originalAdd.call(this, ...objs);
	};

	const originalInsertAt = Canvas.prototype.insertAt;
	Canvas.prototype.insertAt = function (i, ...objs: any[]) {
		objs.forEach(injectMeta);
		return originalInsertAt.call(this, i, ...objs);
	};

	fabric.Canvas.prototype.getZoom = function () {
		return fabric.util.qrDecompose(this.viewportTransform).scaleX;
	};

	// Render Controls Override
	fabric.InteractiveFabricObject.prototype._renderControls = function (
		ctx,
		styleOverride = {},
	) {
		if (!this.canvas) return;
		const canvasCtx = this.canvas.getTopContext();
		const styleOptions = {
			hasBorders: this.hasBorders,
			hasControls: this.hasControls,
			...styleOverride,
		};
		const matrix = fabric.util.multiplyTransformMatrices(
			this.getViewportTransform(),
			this.calcTransformMatrix(),
		);
		const options = fabric.util.qrDecompose(matrix);

		canvasCtx.save();
		canvasCtx.translate(options.translateX, options.translateY);
		canvasCtx.lineWidth = this.borderScaleFactor;

		if (this.group === this.parent)
			canvasCtx.globalAlpha = this.isMoving ? this.borderOpacityWhenMoving : 1;
		if (this.flipX) options.angle -= 180;
		canvasCtx.rotate(
			fabric.util.degreesToRadians(this.group ? options.angle : this.angle),
		);

		if (styleOptions.hasBorders)
			this.drawBorders(canvasCtx, options, styleOverride);
		if (styleOptions.hasControls) this.drawControls(canvasCtx, styleOverride);
		canvasCtx.restore();
	};

	// Defaults and Cleanup
	const primaryColor = getComputedStyle(document.documentElement)
		.getPropertyValue("--ion-color-primary")
		.trim();
	Object.assign(fabric.InteractiveFabricObject.ownDefaults, {
		transparentCorners: false,
		cornerColor: primaryColor,
		cornerStyle: "circle",
		cornerSize: 30,
		originX: "center",
		originY: "center",
		_controlsVisibility: {
			bl: false,
			br: true,
			mb: false,
			ml: false,
			mr: false,
			mt: false,
			mtr: true,
			tl: false,
			tr: false,
		},
	});

	if (fabric.IText.ownDefaults.keysMap) {
		delete fabric.IText.ownDefaults.keysMap[9];
		delete fabric.IText.ownDefaults.keysMap[27];
	}
}

export const initCanvasOptions = (
	width: number,
	height: number,
): Partial<CanvasOptions> => ({
	width,
	height,
	isDrawingMode: true,
	backgroundColor: BACKGROUND,
	fireMiddleClick: true,
	selection: false,
	preserveObjectStacking: true,
	renderOnAddRemove: false,
});

export function overrideFindTarget(c: Canvas) {
	const SEARCH_PADDING = 10;
	(c as any).findTarget = function (e: any) {
		const pointer = this.getScenePoint(e);
		const activeObject = this._activeObject;

		if (
			activeObject &&
			(this as any)._isClick &&
			activeObject.containsPoint(pointer)
		) {
			return { target: activeObject, subTargets: [] };
		}
		if (this._targetInfo) return this._targetInfo;
		if (this.skipTargetFind) return { subTargets: [], currentSubTargets: [] };

		const candidates = useDrawObjectManager().query(
			new Rect(
				pointer.x - SEARCH_PADDING,
				pointer.y - SEARCH_PADDING,
				SEARCH_PADDING * 2,
				SEARCH_PADDING * 2,
			),
		);
		const targetInfo = this.searchPossibleTargets(candidates, pointer);
		const fullTargetInfo = {
			...targetInfo,
			currentSubTargets: targetInfo.subTargets,
			currentContainer: targetInfo.container,
			currentTarget: targetInfo.target,
		};

		if (!activeObject) return fullTargetInfo;

		const activeObjectControl = activeObject.findControl(
			this.getViewportPoint(e),
			fabric.util.isTouchEvent(e),
		);
		if (activeObjectControl) return { ...targetInfo, target: activeObject };
		if (
			targetInfo.target &&
			(this.getActiveObjects().length > 1 ||
				!this.preserveObjectStacking ||
				e[this.altSelectionKey as any])
		) {
			return { ...targetInfo, ...fullTargetInfo };
		}
		return fullTargetInfo;
	};
}

export function overrideMouseUp(c: Canvas) {
	(c as any).__onMouseUp = function (e: TPointerEvent) {
		this._handleEvent(e, "up:before");
		const { button } = e as MouseEvent;
		if (button) {
			if (
				(this.fireMiddleClick && button === 1) ||
				(this.fireRightClick && button === 2)
			)
				this._handleEvent(e, "up");
			return;
		}
		if (this.isDrawingMode && this._isCurrentlyDrawing)
			return this._onMouseUpInDrawingMode(e);
		if (!this._isMainEvent(e)) return;

		const transform = this._currentTransform;
		let shouldRender = false;
		if (transform) {
			this._finalizeCurrentTransform(e);
			shouldRender = !!transform.actionPerformed;
		}

		const { target } = this.findTarget(e);
		if (!(this as any)._isClick) {
			const targetWasActive = target === this._activeObject;
			this.handleSelection(e);
			shouldRender ||=
				this._shouldRender(target) ||
				(!targetWasActive && target === this._activeObject);
		}

		let corner: string | undefined;
		if (target) {
			const found = target.findControl(
				this.getViewportPoint(e),
				fabric.util.isTouchEvent(e),
			);
			corner = found?.key;
			if (
				target.selectable &&
				target !== this._activeObject &&
				target.activeOn === "up"
			) {
				this.setActiveObject(target, e);
			} else if (found?.control) {
				found.control
					.getMouseUpHandler(e, target, found.control)
					?.call(
						found.control,
						e,
						transform!,
						...Object.values(this.getScenePoint(e)),
					);
			}
			target.isMoving = false;
		}

		if (
			transform &&
			(transform.target !== target || transform.corner !== corner)
		) {
			const ctrl = transform.target?.controls[transform.corner];
			ctrl
				?.getMouseUpHandler(e, transform.target, ctrl)
				?.call(ctrl, e, transform, ...Object.values(this.getScenePoint(e)));
		}

		this._setCursorFromEvent(e, target);
		this._handleEvent(e, "up");
		this._groupSelector = null;
		this._currentTransform = null;
		if (target) target.__corner = undefined;

		if (
			shouldRender ||
			(!(this as any)._isClick &&
				!this._activeObject &&
				!(this._activeObject as IText)?.isEditing)
		) {
			this.renderTop();
			this.getActiveObject()?._renderControls(this.getTopContext());
		}
	};
}

export function overrideMouseDown(c: Canvas) {
	(c as any).__onMouseDown = function (e: TPointerEvent) {
		(this as any)._isClick = true;
		this._handleEvent(e, "down:before");

		let { target } = this.findTarget(e);
		const { button } = e as MouseEvent;
		const alreadySelected = !!target && target === this._activeObject;

		if (button) {
			if (
				(this.fireMiddleClick && button === 1) ||
				(this.fireRightClick && button === 2)
			)
				this._handleEvent(e, "down", { alreadySelected });
			return;
		}
		if (
			button === 1 ||
			this._currentTransform ||
			(!this.isDrawingMode && !this._isMainEvent(e))
		)
			return;
		if (this.isDrawingMode) return this._onMouseDownInDrawingMode(e);

		let shouldRender = this._shouldRender(target);
		if (this.handleMultiSelection(e, target)) {
			target = this._activeObject;
			shouldRender = true;
		} else if (this._shouldClearSelection(e, target)) {
			this.discardActiveObject(e);
		}

		if (
			this.selection &&
			(!target ||
				(!target.selectable &&
					!(target as IText).isEditing &&
					target !== this._activeObject))
		) {
			const p = this.getScenePoint(e);
			this._groupSelector = { x: p.x, y: p.y, deltaY: 0, deltaX: 0 };
		}

		if (target) {
			if (target.selectable && target.activeOn === "down")
				this.setActiveObject(target, e);
			const handle = target.findControl(
				this.getViewportPoint(e),
				fabric.util.isTouchEvent(e),
			);
			if (
				target === this._activeObject &&
				(handle || !this.handleMultiSelection(e, target))
			) {
				this._setupCurrentTransform(
					e,
					target,
					!!target && target === this._activeObject,
				);
				handle?.control
					.getMouseDownHandler(e, target, handle.control)
					?.call(
						handle.control,
						e,
						this._currentTransform!,
						...Object.values(this.getScenePoint(e)),
					);
			}
		}
		if (shouldRender) this._objectsToRender = undefined;
		this._handleEvent(e, "down", {
			alreadySelected: !!target && target === this._activeObject,
		});
	};
}

export let MOVE_HAPPENED = false;
export function overrideTransform(canvas: Canvas) {
	let rafPending = false,
		pendingEvent: MouseEvent | null = null;

	// Define a threshold (e.g., 4 pixels)
	const MOVEMENT_THRESHOLD = 4;
	let startPointer: { x: number; y: number } | null = null;

	canvas.on("mouse:down", (e: any) => {
		MOVE_HAPPENED = false;
		if (e.target && e.e.button !== 1) {
			// Capture starting position on interaction
			startPointer = canvas.getScenePoint(e.e);
			prepareCssOverlay(canvas, e.target);
			canvas.clearContext(canvas.contextTop);
			e.target._renderControls(canvas.contextTop);
		}
	});

	canvas._transformObject = function (e: MouseEvent) {
		pendingEvent = e;
		if (rafPending) return;
		rafPending = true;

		const { isGesturing } = useGestureStore();
		if (isGesturing) return;

		requestAnimationFrame(() => {
			rafPending = false;
			const evt = pendingEvent;
			pendingEvent = null;
			if (!evt || !this._currentTransform) return;

			const target = this._currentTransform.target;
			const scenePoint = this.getScenePoint(evt);

			if (startPointer) {
				const dx = scenePoint.x - startPointer.x;
				const dy = scenePoint.y - startPointer.y;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (
					distance < MOVEMENT_THRESHOLD &&
					!this._currentTransform.actionPerformed
				) {
					return;
				}
			}

			const local = target.group
				? fabric.util.sendPointToPlane(
						scenePoint,
						undefined,
						target.group.calcTransformMatrix(),
					)
				: scenePoint;

			this._currentTransform.shiftKey = evt.shiftKey;
			this._currentTransform.altKey =
				!!this.centeredKey && (evt as any)[this.centeredKey];

			// Perform the action (this sets actionPerformed = true internally)
			MOVE_HAPPENED = true;
			this._performTransformAction(evt, this._currentTransform, local);

			if (this._currentTransform.actionPerformed && isLayeredRenderActive)
				renderCssOverlay(this, target);
		});
	};

	canvas.on("mouse:up", () => {
		rafPending = false;
		pendingEvent = null;
		startPointer = null; // Reset

		const { isGesturing } = useGestureStore();
		if (isGesturing) return;
		finalizeCssOverlay(canvas);
	});
}

export function overrideHandleSelection(c: Canvas) {
	(c as any).handleSelection = function (e: TPointerEvent): boolean {
		if (!this.selection || !this._groupSelector) return false;
		const { x, y, deltaX, deltaY } = this._groupSelector;
		const tl = new Point(x, y).min(new Point(x + deltaX, y + deltaY));
		const br = new Point(x, y).max(new Point(x + deltaX, y + deltaY));

		const mgr = useDrawObjectManager();
		const collected = mgr
			.query(new Rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y))
			.filter(
				(obj) =>
					obj.selectable &&
					obj.visible &&
					(obj.intersectsWithRect(tl, br) ||
						obj.isContainedWithinRect(tl, br) ||
						obj.containsPoint(tl) ||
						obj.containsPoint(br)),
			);

		const zMap = mgr.getZIndexMap();
		collected.sort((a, b) => (zMap.get(b) ?? 0) - (zMap.get(a) ?? 0));

		const isClick = x === x + deltaX && y === y + deltaY;
		const objects = isClick
			? collected[0]
				? [collected[0]]
				: []
			: collected.filter((o) => !(o as any).onSelect({ e })).reverse();

		if (objects.length > 0)
			this.setActiveObject(
				objects.length === 1
					? objects[0]
					: new (fabric.classRegistry.getClass<any>("ActiveSelection"))(
							objects,
							{ canvas: this },
						),
				e,
			);
		this._groupSelector = null;
		return true;
	};
}
