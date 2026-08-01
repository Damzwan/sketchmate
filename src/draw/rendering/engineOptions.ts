import {
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
	MAX_RENDER_SCALE,
} from "@/draw/config/renderQuality.config";
import type { RenderEngineOptions } from "@/draw/rendering/renderEngine";
import { DEFAULT_OVERVIEW_TIER } from "@/draw/rendering/zoomLevels";
import { DRAW_MEMORY_PROFILE } from "@/draw/config/drawMemory.config";

export const isLowEndDrawDevice = IS_LOW_END_DEVICE;
export const isMobileDrawDevice = IS_MOBILE_DEVICE;

export function createEngineOptions(): RenderEngineOptions {
	return {
		memoryBudgetMB: DRAW_MEMORY_PROFILE.tileBudgetMB,
		overviewPx: DRAW_MEMORY_PROFILE.overviewPx,
		overviewTier: DEFAULT_OVERVIEW_TIER,
		liveMax: isLowEndDrawDevice ? 32 : 64,
		tileSize: isMobileDrawDevice ? 384 : 512,
		poolMax: DRAW_MEMORY_PROFILE.tilePoolMax,
		maxRenderScale: MAX_RENDER_SCALE,
		overviewPatchMax: DRAW_MEMORY_PROFILE.overviewPatchMax,
		overviewWorkBudgetMs: DRAW_MEMORY_PROFILE.overviewWorkBudgetMs,
		renderChunk: DRAW_MEMORY_PROFILE.renderChunk,
	};
}
