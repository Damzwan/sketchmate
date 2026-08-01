import { FabricObject } from "fabric";

/**
 * Refresh only the geometry Fabric needs while a bitmap-backed transform is
 * live.
 *
 * ActiveSelection inherits Group.setCoords(), which recursively calls
 * setCoords() on every selected child. During a drag those children are hidden,
 * hit-testing is disabled, and a CSS-transformed bitmap supplies the pixels, so
 * recomputing thousands of child coordinate sets on every pointer event is pure
 * waste. The full child/spatial-index reconciliation still runs once on drop.
 */
export function setLiveTransformCoords(target: FabricObject): void {
	if ((target.type || "").toLowerCase() === "activeselection") {
		FabricObject.prototype.setCoords.call(target);
		return;
	}
	target.setCoords();
}
