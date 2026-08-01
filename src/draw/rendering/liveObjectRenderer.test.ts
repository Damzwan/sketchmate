import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer } from "@/draw/layers/layer.types";
import {
	resetLayerRegistry,
	setLayerSet,
} from "@/draw/layers/layerRegistry";
import { createLiveObjectRenderer } from "./liveObjectRenderer";

describe("live object rendering with layers", () => {
	beforeEach(() => resetLayerRegistry());

	it("does not composite a newly drawn object from a hidden layer", () => {
		setLayerSet(
		[
			createLayer("visible", "Visible", 0),
			{ ...createLayer("hidden", "Hidden", 1), visible: false },
		],
		"mutable",
		);
		const render = vi.fn();
		const object = { layerId: "hidden", render } as any;
		const draw = createLiveObjectRenderer(
			() => ({ viewportTransform: [1, 0, 0, 1, 0, 0] }) as any,
		);

		draw({} as CanvasRenderingContext2D, object);

		expect(render).not.toHaveBeenCalled();
	});
});
