import type { FabricObject } from "fabric";
import { isOnActiveLayer } from "@/draw/layers/layerRegistry";

/**
 * What a pointer erase is allowed to touch: an erasable object on the layer
 * being edited. Everything else is PROTECTED — the eraser must neither commit
 * to it nor make it look erased mid-stroke.
 *
 * One function, two consumers that must never disagree:
 *   • the brush's `erasableFilter`, which decides commit targets;
 *   • `protectObjectsProvider`, which builds the live mask.
 * They diverged once already (candidates were scoped, the mask was not), and
 * the symptom was content vanishing under the pointer and returning on release.
 */
export function isEraseTarget(object: FabricObject): boolean {
	return !!object.erasable && isOnActiveLayer((object as any).layerId);
}

/** The complement: what must be repainted into the live mask. */
export function isEraseProtected(object: FabricObject): boolean {
	return !isEraseTarget(object);
}
