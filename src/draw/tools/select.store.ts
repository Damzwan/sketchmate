import type { Canvas, FabricObject, Point } from "fabric";
import * as fabric from "fabric";
import { defineStore } from "pinia";
import { type Ref, ref, shallowRef } from "vue";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { compareRenderOrder } from "@/draw/layers/layerRegistry";
import { getAbsoluteState } from "@/draw/objects/objectSerialization";
import { isText } from "@/draw/tools/textEditing";
import type { ToolService } from "@/draw/tools/tool.types";
import * as transform from "@/draw/transform/transformController";
import { v4 } from "@/utils/uuid";

interface Select extends ToolService {
	unSelect: () => void;
	getSelectedObjects: () => FabricObject[];
	isSelectActive: Ref<boolean>;
	selectedObjectsRef: Ref<FabricObject[]>;
	multiSelectMode: Ref<boolean>;
	shouldModifyObjectsWithGestures: () => boolean;
	isEditingText: Ref<boolean>;
	getSelectedObjectOriginalStates: () => Map<string, any>;
}

export const useSelect = defineStore("select", (): Select => {
	let c: Canvas | undefined;
	let gestureRestoreTimer: ReturnType<typeof setTimeout> | null = null;
	const isSelectActive = ref(false);

	let selectedObjects: FabricObject[] = [];
	const selectedObjectsRef = shallowRef<FabricObject[]>([]);

	const multiSelectMode = ref(false); // TODO not yet implemented
	let clicksAfterSelectionActive = 0;

	const isEditingText = ref(false);
	const _isBottomHalf = ref(false);

	let wasDragging = false;
	let pointerDownPos: Point | null = null;

	let useGestures = false; // means that when we zoom or rotate we edit the object instead of zooming/panning the canvas

	const originalStates = new Map<string, any>();

	let isUsingGestures = false;

	// ----------------- Helper Functions -----------------
	function getObjectsUnderPointer(pointer: Point) {
		const manager = useDrawObjectManager();
		const claim = useClaimArea();
		const candidates = manager.querySelectable({
			x: pointer.x,
			y: pointer.y,
			w: 0,
			h: 0,
		});
		manager.getZIndexMap();
		return candidates
			.filter((obj) => {
				if (!obj.selectable || !obj.visible || claim.isObjectProtected(obj))
					return false;
				obj.setCoords();
				return obj.containsPoint(pointer);
			})
			.sort((a, b) => compareRenderOrder(b, a));
	}

	function cycleSelection(pointer: Point) {
		const { actionWithoutEvents } = useDrawEventManager();
		const objsUnderPointer = getObjectsUnderPointer(pointer);
		const nextObj = objsUnderPointer.find(
			(obj) => !selectedObjects.includes(obj),
		);
		if (nextObj) {
			void actionWithoutEvents(() => {
				c!.setActiveObject(nextObj);
				selectedObjects = [nextObj];
				selectedObjectsRef.value = [nextObj];
				c!.clearContext(c!.getTopContext());
				nextObj._renderControls(c!.getTopContext());
			});
		}
	}

	function handleMultiSelect(pointer: Point) {
		const currentSelection = c!.getActiveObjects() || [];
		c!.discardActiveObject();
		const { actionWithoutEvents } = useDrawEventManager();

		const objectsUnderPointer = getObjectsUnderPointer(pointer);
		const newObjects = objectsUnderPointer.filter(
			(obj) =>
				!currentSelection.includes(obj) &&
				currentSelection.every((sel) =>
					sel.containsPoint(pointer) ? obj.isContainedWithinObject(sel) : true,
				),
		);

		if (newObjects.length) {
			void actionWithoutEvents(() => {
				const newSelection = [...currentSelection, ...newObjects.slice(0, 1)];
				c!.setActiveObject(
					new fabric.ActiveSelection(newSelection, { canvas: c }),
				);
				selectedObjects = newSelection;
				selectedObjectsRef.value = [...newSelection];
			});
		} else {
			// If click on selected object, unselect it
			const toUnselect = objectsUnderPointer.filter((obj) =>
				currentSelection.includes(obj),
			);
			if (toUnselect.length) {
				void actionWithoutEvents(() => {
					c!.setActiveObject(
						new fabric.ActiveSelection(
							currentSelection.filter((o) => !toUnselect.includes(o)),
							{ canvas: c },
						),
					);
					selectedObjects = c!.getActiveObjects() || [];
					selectedObjectsRef.value = [...selectedObjects];
				});
			}
		}
	}

	// ----------------- Event Handlers -----------------
	const events: FabricEvent[] = [
		{
			on: "selection:created",
			handler: (e: any) => {
				const active = c!._activeObject;
				if (active?.isType("activeselection")) active.id = v4(); // TODO is this necessary?

				const members = active?.isType("activeselection")
					? ([...(active as any)._objects] as FabricObject[])
					: e.selected;
				setSelection(members);
				temporarilyDisableGestures();
				transform.invalidateCache();
				transform.prewarm(c!);
			},
		},
		{
			on: "selection:updated",
			handler: (e: any) => {
				const currentSelection = c!.getActiveObjects();

				if (isText(e.deselected) && isEditingText.value) {
					c!.setActiveObject(selectedObjects[0]);
					isEditingText.value = false;
					return;
				}

				setSelection(currentSelection);
				temporarilyDisableGestures();
				transform.invalidateCache();
				transform.prewarm(c!);
			},
		},
		{
			on: "selection:cleared",
			handler: () => {
				if (isText(selectedObjects) && isEditingText.value) {
					c!.setActiveObject(selectedObjects[0]);
					isEditingText.value = false;
					c!.clearContext(c!.getTopContext());
					selectedObjects[0]._renderControls(c!.getTopContext());
					return;
				}

				clearSelection();
			},
		},
		{
			on: "mouse:down",
			handler: (e) => {
				c!.skipTargetFind = true;
				startPointerTracking(c!.getScenePoint(e.e));
				clicksAfterSelectionActive++;
			},
		},
		{
			on: "before:transform",
			handler: () => {
				originalStates.clear();
				c!.getActiveObjects().forEach((obj) => {
					originalStates.set(obj.id, getAbsoluteState(obj));
				});
			},
		},
		{
			on: "mouse:move",
			handler: (e) => {
				updatePointerTracking(c!.getScenePoint(e.e));
			},
		},
		{
			on: "mouse:up",
			handler: () => {
				c!.skipTargetFind = false;
				if (!isSelectActive.value || !isClick() || isUsingGestures) return;
				if (clicksAfterSelectionActive <= 1) return;

				handleSelectionClick(pointerDownPos!);
				pointerDownPos = null;
			},
		},
		{
			on: "gestureStart",
			handler: () => {
				isUsingGestures = true;
			},
		},
		{
			on: "gestureEnd",
			handler: () => {
				isUsingGestures = false;
			},
		},
	];

	// ----------------- Store Functions -----------------
	function init(canvas: Canvas) {
		c = canvas;
	}

	function destroy() {
		if (gestureRestoreTimer) clearTimeout(gestureRestoreTimer);
		gestureRestoreTimer = null;
		selectedObjects = [];
		selectedObjectsRef.value = [];
		isSelectActive.value = false;
		pointerDownPos = null;
		c = undefined;
	}

	async function select() {
		c!.isDrawingMode = false;
		c!.skipTargetFind = false;
		c!.selection = true;
	}

	function unSelect() {
		if (c!.getActiveObject()) {
			c!.discardActiveObject();
			c!.clearContext(c!.contextTop);
		}
		isSelectActive.value = false;
		selectedObjects = [];
		selectedObjectsRef.value = [];
	}

	function getSelectedObjects() {
		return selectedObjects;
	}

	function shouldModifyObjectsWithGestures() {
		if (selectedObjects.length === 0 || !useGestures) return false;
		else return useGestures;
	}

	function setSelection(objects: FabricObject[]) {
		selectedObjects = objects;
		selectedObjectsRef.value = [...objects];
		isSelectActive.value = objects.length > 0;
	}

	function clearSelection() {
		selectedObjects = [];
		selectedObjectsRef.value = [];
		isSelectActive.value = false;
		c!.clearContext(c!.contextTop);
	}

	function handleSelectionClick(pointer: Point) {
		if (multiSelectMode.value) {
			handleMultiSelect(pointer);
			return;
		}
		cycleSelection(pointer);
	}

	function startPointerTracking(pointer: Point) {
		pointerDownPos = pointer;
		wasDragging = false;
	}

	function updatePointerTracking(pointer: Point) {
		if (!pointerDownPos) return;
		const dx = pointer.x - pointerDownPos.x;
		const dy = pointer.y - pointerDownPos.y;
		wasDragging ||= Math.hypot(dx, dy) > 5;
	}

	function isClick() {
		return !!pointerDownPos && !wasDragging;
	}

	function temporarilyDisableGestures() {
		useGestures = false;
		clicksAfterSelectionActive = 0;

		if (gestureRestoreTimer) clearTimeout(gestureRestoreTimer);
		gestureRestoreTimer = setTimeout(() => {
			gestureRestoreTimer = null;
			useGestures = true;
			clicksAfterSelectionActive++;
		}, 100);
	}

	function getSelectedObjectOriginalStates() {
		return originalStates;
	}

	return {
		select,
		init,
		destroy,
		events,
		unSelect,
		isSelectActive,
		getSelectedObjects,
		selectedObjectsRef,
		multiSelectMode,
		shouldModifyObjectsWithGestures,
		isEditingText,
		getSelectedObjectOriginalStates,
	};
});
