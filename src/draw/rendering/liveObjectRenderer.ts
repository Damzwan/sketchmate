import type { Canvas, FabricObject } from "fabric";
import { isLayerHidden } from "@/draw/layers/layerRegistry";

export function createLiveObjectRenderer(getCanvas: () => Canvas | undefined) {
	return (context: CanvasRenderingContext2D, object: FabricObject): void => {
		const canvas = getCanvas();
		if (!canvas || isLayerHidden((object as any).layerId)) return;

		const item = object as any;
		const needsCanvas = Boolean(item.clipPath || item.shadow);
		const previousCanvas = item.canvas;
		const previousCaching = item.objectCaching;
		const previousScaling = item.getTotalObjectScaling;
		const viewport = canvas.viewportTransform!;
		const scale = Math.abs(viewport[0]) || 1;

		if (!needsCanvas) item.canvas = null;
		item.objectCaching = false;
		item.getTotalObjectScaling = function () {
			return this.getObjectScaling().scalarMultiply(scale);
		};

		const shadowBlur = item.shadow?.blur;
		if (item.shadow) item.shadow.blur = shadowBlur * viewport[0];

		try {
			object.render(context);
		} catch {
			// A malformed live object must not stop the frame.
		} finally {
			if (!needsCanvas) item.canvas = previousCanvas;
			item.objectCaching = previousCaching;
			item.getTotalObjectScaling = previousScaling;
			if (item.shadow) item.shadow.blur = shadowBlur;
		}
	};
}
