import {
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
	MAX_RENDER_SCALE,
} from "@/draw/config/renderQuality.config";
import type { RenderEngineOptions } from "@/draw/rendering/renderEngine";

export const isLowEndDrawDevice = IS_LOW_END_DEVICE;
export const isMobileDrawDevice = IS_MOBILE_DEVICE;

export function createEngineOptions(): RenderEngineOptions {
	const memoryBudgetMB = isLowEndDrawDevice
		? 40
		: isMobileDrawDevice
			? 72
			: 128;

	return {
		memoryBudgetMB,
		overviewPx: isMobileDrawDevice ? 1024 : 2048,
		// Tier 1 preserves the 0.25 overview threshold after the tier ladder shift.
		overviewTier: 1,
		liveMax: isLowEndDrawDevice ? 32 : 64,
		tileSize: isMobileDrawDevice ? 384 : 512,
		poolMax: isLowEndDrawDevice ? 3 : isMobileDrawDevice ? 4 : 8,
		maxRenderScale: MAX_RENDER_SCALE,
		overviewPatchMax: isLowEndDrawDevice ? 80 : 200,
		renderChunk: isLowEndDrawDevice ? 8 : isMobileDrawDevice ? 16 : 32,
	};
}
