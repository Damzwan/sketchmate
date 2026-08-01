import type { WorldRect } from "./committedLayer";

export interface OverviewDimensions {
	width: number;
	height: number;
}

export function chooseOverviewDimensions(
	bounds: WorldRect,
	targetDensity: number,
	pixelBudgetEdge: number,
	maxEdge = 4096,
): OverviewDimensions {
	const desiredWidth = Math.max(1, Math.ceil(bounds.w * targetDensity));
	const desiredHeight = Math.max(1, Math.ceil(bounds.h * targetDensity));
	const pixelBudget = pixelBudgetEdge ** 2;
	const scale = Math.min(
		1,
		maxEdge / desiredWidth,
		maxEdge / desiredHeight,
		Math.sqrt(pixelBudget / (desiredWidth * desiredHeight)),
	);

	return {
		width: Math.max(1, Math.floor(desiredWidth * scale)),
		height: Math.max(1, Math.floor(desiredHeight * scale)),
	};
}
