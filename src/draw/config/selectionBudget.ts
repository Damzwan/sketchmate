import {
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
	IS_SEVERELY_CONSTRAINED_DEVICE,
} from "./renderQuality.config";

export interface SelectionBudgetDevice {
	mobile: boolean;
	lowEnd: boolean;
	severe: boolean;
}

/**
 * Maximum members allowed in one Fabric ActiveSelection.
 *
 * ActiveSelection construction is one synchronous transform/layout operation;
 * it cannot yield between children. The bitmap prewarm that follows then
 * renders the group in one call. A lasso over a dense drawing previously fed
 * both operations every matching object with no upper bound.
 *
 * These are safety ceilings, not memory targets. The topmost members are kept
 * when a lasso exceeds the ceiling so the result still corresponds to what the
 * user can see and manipulate.
 */
export function resolveSelectionObjectLimit(
	device: SelectionBudgetDevice,
): number {
	if (!device.mobile) return 512;
	if (device.severe) return 64;
	if (device.lowEnd) return 128;
	return 256;
}

export const DRAW_SELECTION_OBJECT_LIMIT = resolveSelectionObjectLimit({
	mobile: IS_MOBILE_DEVICE,
	lowEnd: IS_LOW_END_DEVICE,
	severe: IS_SEVERELY_CONSTRAINED_DEVICE,
});

export interface CappedSelection<T> {
	objects: T[];
	omitted: number;
}

/**
 * Cap an array ordered from bottommost to topmost, preserving what is visible.
 * Kept generic/pure so every ActiveSelection entry point can share the exact
 * same policy without importing Fabric or UI services into config.
 */
export function capOrderedSelection<T>(
	orderedBottomToTop: readonly T[],
	limit = DRAW_SELECTION_OBJECT_LIMIT,
): CappedSelection<T> {
	const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
	const omitted = Math.max(0, orderedBottomToTop.length - safeLimit);
	return {
		objects: orderedBottomToTop.slice(omitted),
		omitted,
	};
}
