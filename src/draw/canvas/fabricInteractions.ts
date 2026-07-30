import { useClaimArea } from "@/draw/claims/claimArea.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useGestureStore } from "@/draw/tools/gesture.store";
import * as transform from "@/draw/transform/transformController";
import * as fabric from "fabric";
import { Canvas, IText, Point, type TPointerEvent } from "fabric";

export function overrideFindTarget(c: Canvas) {
	const SEARCH_PADDING_PX = 10; // screen pixels

	(c as any).findTarget = function (e: any) {
		if (this.skipTargetFind) {
			return { subTargets: [], currentSubTargets: [] };
		}
		if (this._targetInfo) return this._targetInfo;

		const pointer = this.getScenePoint(e);
		const activeObject = this._activeObject;
		const isTouch = fabric.util.isTouchEvent(e);
		const viewportPoint = this.getViewportPoint(e);

		if (activeObject) {
			const handle = activeObject.findControl(viewportPoint, isTouch);
			if (handle) {
				return { target: activeObject, subTargets: [] };
			}

			if (activeObject.containsPoint(pointer)) {
				return { target: activeObject, subTargets: [], currentSubTargets: [] };
			}
		}

		const zoom = this.getZoom();
		const padWorld = SEARCH_PADDING_PX / zoom;
		const candidates = useDrawObjectManager().query({
			x: pointer.x - padWorld,
			y: pointer.y - padWorld,
			w: padWorld * 2,
			h: padWorld * 2,
		});

		if (candidates.length === 0) {
			return { target: undefined, subTargets: [], currentSubTargets: [] };
		}

		const zMap = useDrawObjectManager().getZIndexMap();
		candidates.sort((a, b) => (zMap.get(a) ?? 0) - (zMap.get(b) ?? 0));

		const targetInfo = this.searchPossibleTargets(candidates, pointer);

		// Objects inside another user's claimed area are read-only: hide them from
		// targeting so they can't be selected or dragged.
		if (
			targetInfo.target &&
			useClaimArea().isObjectProtected(targetInfo.target)
		) {
			return { target: undefined, subTargets: [], currentSubTargets: [] };
		}

		return {
			...targetInfo,
			currentSubTargets: targetInfo.subTargets,
			currentContainer: targetInfo.container,
			currentTarget: targetInfo.target,
		};
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
			if (target || this._activeObject) {
				this.getActiveObject()?._renderControls(this.getTopContext());
			}
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

		// Claimed-area enforcement: pressing inside a FOREIGN area warns, and in a
		// drawing tool it also blocks the stroke from starting there.
		const claim = useClaimArea();
		if (claim.foreignAreas.length > 0) {
			const scene = this.getScenePoint(e);
			const foreign = claim.pointInForeignArea(scene.x, scene.y);
			if (foreign) {
				claim.notifyBlocked(foreign);
				if (this.isDrawingMode) return;
			}
		}

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

export function overrideTransform(canvas: Canvas) {
	const MOVEMENT_THRESHOLD = 4;
	let startPointer: { x: number; y: number } | null = null;

	canvas.on("mouse:down", (e: any) => {
		if (e.target && e.e.button !== 1) {
			startPointer = canvas.getScenePoint(e.e);
			// RESTORED: This ensures the overlay handles controls immediately on click
			transform.beginOrContinue(canvas, e.target);
		}
	});

	canvas._transformObject = function (e: MouseEvent) {
		if (!this._currentTransform) return;
		if (useGestureStore().isGesturing) return;

		const target = this._currentTransform.target;
		const scenePoint = this.getScenePoint(e);

		if (startPointer) {
			const dx = scenePoint.x - startPointer.x;
			const dy = scenePoint.y - startPointer.y;
			if (
				Math.sqrt(dx * dx + dy * dy) < MOVEMENT_THRESHOLD &&
				!this._currentTransform.actionPerformed
			)
				return;
		}

		const local = target.group
			? fabric.util.sendPointToPlane(
					scenePoint,
					undefined,
					target.group.calcTransformMatrix(),
				)
			: scenePoint;

		this._currentTransform.shiftKey = e.shiftKey;
		this._currentTransform.altKey =
			!!this.centeredKey && (e as any)[this.centeredKey];

		transform.markMoved();
		this._performTransformAction(e, this._currentTransform, local);

		if (this._currentTransform.actionPerformed && transform.isActive()) {
			transform.schedule();
		}
	};

	canvas.on("mouse:up", () => {
		startPointer = null;
		if (transform.isActive()) transform.releaseDrag(canvas);
	});
}

export function overrideHandleSelection(c: Canvas) {
	(c as any).handleSelection = function (e: TPointerEvent): boolean {
		if (!this.selection || !this._groupSelector) return false;
		const { x, y, deltaX, deltaY } = this._groupSelector;
		const tl = new Point(x, y).min(new Point(x + deltaX, y + deltaY));
		const br = new Point(x, y).max(new Point(x + deltaX, y + deltaY));

		const mgr = useDrawObjectManager();
		const lassoBounds = {
			x: tl.x,
			y: tl.y,
			w: br.x - tl.x,
			h: br.y - tl.y,
		};

		const isClick = x === x + deltaX && y === y + deltaY;

		const claim = useClaimArea();
		const collected = mgr.query(lassoBounds).filter((obj) => {
			if (!obj.selectable || !obj.visible) return false;
			// Skip objects locked inside another user's claimed area.
			if (claim.isObjectProtected(obj)) return false;

			obj.setCoords();

			if (isClick) {
				return obj.containsPoint(tl);
			} else {
				return (
					obj.intersectsWithRect(tl, br) || obj.isContainedWithinRect(tl, br)
				);
			}
		});

		const zMap = mgr.getZIndexMap();
		collected.sort((a, b) => (zMap.get(b) ?? 0) - (zMap.get(a) ?? 0));

		const objects = isClick
			? collected[0]
				? [collected[0]]
				: []
			: collected.filter((o) => !(o as any).onSelect({ e })).reverse();

		if (objects.length > 0) {
			this.setActiveObject(
				objects.length === 1
					? objects[0]
					: new (fabric.classRegistry.getClass<any>("ActiveSelection"))(
							objects,
							{
								canvas: this,
							},
						),
				e,
			);
			// Bake the selection bitmap during idle so the first grab of this
			// fresh selection is a cache hit instead of a mouse:down sync render.
			transform.prewarm(this as Canvas);
		}

		this._groupSelector = null;
		return true;
	};
}
