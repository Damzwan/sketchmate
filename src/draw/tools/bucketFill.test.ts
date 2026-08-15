import { beforeEach, describe, expect, it, vi } from "vitest";

// The module reaches the object manager (fabric, stores, the router) through its
// imports, so the graph is stubbed down to what the buffer helpers touch.
vi.mock("@/draw/canvas/drawObjectManager", () => ({
	useDrawObjectManager: () => ({ query: () => [], getZIndexMap: () => {} }),
}));
vi.mock("@/draw/layers/layerRegistry", () => ({ compareRenderOrder: () => 0 }));
vi.mock("@/draw/tools/pen.store", () => ({
	usePen: () => ({ brushColorWithOpacity: () => "#000" }),
}));
vi.mock("@/draw/utils/BucketFillPath", () => ({ BucketFillPath: class {} }));
vi.mock("@/service/toast.service", () => ({
	useToast: () => ({ toast: () => {} }),
}));

import { releaseFillBuffer } from "./bucketFill";

describe("bucket fill offscreen buffer", () => {
	beforeEach(() => {
		releaseFillBuffer();
	});

	it("is safe to release when none was ever taken", () => {
		// `destroy()` runs on every canvas teardown, including sessions where the
		// bucket tool was never used.
		expect(() => releaseFillBuffer()).not.toThrow();
	});

	it("is safe to release twice", () => {
		// init() aborts and destroy() releases; both can run back to back when a
		// user leaves and re-enters a drawing.
		releaseFillBuffer();
		expect(() => releaseFillBuffer()).not.toThrow();
	});
});
