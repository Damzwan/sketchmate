import { RASTER_PREFERS_DOM_CANVAS } from "@/draw/rendering/rasterSurface";
import { resolveDrawMemoryProfile } from "./drawMemoryProfile";
import {
	DRAW_DEVICE_MEMORY_GB,
	DRAW_HARDWARE_CONCURRENCY,
	DRAW_SCREEN_EDGE_PX,
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
} from "./renderQuality.config";

export const DRAW_MEMORY_PROFILE = resolveDrawMemoryProfile({
	mobile: IS_MOBILE_DEVICE,
	lowEnd: IS_LOW_END_DEVICE,
	deviceMemoryGB: DRAW_DEVICE_MEMORY_GB,
	hardwareConcurrency: DRAW_HARDWARE_CONCURRENCY,
	screenEdgePx: DRAW_SCREEN_EDGE_PX,
	canvasTileSurfaces: RASTER_PREFERS_DOM_CANVAS,
});
