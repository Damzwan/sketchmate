import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Rect } from "fabric";
// Only `compressImg` is used by the module under test, and the real helper
// drags firebase (and the whole app bootstrap) into the import graph.
vi.mock("@/helper/general.helper", () => ({ compressImg: vi.fn() }));

const { exportBoundingBoxImage } = await import("@/draw/document/export");

/** Enough of a 2D context for fabric's Rect render path. */
function stubContext(): CanvasRenderingContext2D {
	const noop = () => undefined;
	return new Proxy({} as any, {
		get: (target, key) => {
			if (key in target) return target[key];
			return noop;
		},
		set: (target, key, value) => {
			target[key] = value;
			return true;
		},
	}) as CanvasRenderingContext2D;
}

/** The suite runs in node: give the exporter just the DOM surface it uses. */
function stubCanvasElement() {
	return {
		width: 0,
		height: 0,
		getContext: () => stubContext(),
		// Resolving with no blob ends the export early; this test is about what
		// happened during the render pass, not about encoding.
		toBlob: (cb: (blob: Blob | null) => void) => cb(null),
	} as any;
}

beforeEach(() => {
	(globalThis as any).document = {
		createElement: (tag: string) =>
			tag === "canvas" ? stubCanvasElement() : ({} as any),
	};
	(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
		setTimeout(() => cb(0), 0) as unknown as number;
});

afterEach(() => {
	vi.restoreAllMocks();
	delete (globalThis as any).document;
	delete (globalThis as any).requestAnimationFrame;
});

describe("exportBoundingBoxImage rasterization scale", () => {
	it("rasterizes at the export scale, not the live viewport zoom", async () => {
		// An erased object is force-cached by fabric (needsItsOwnCache), and a cache
		// is rasterized at whatever getTotalObjectScaling() reports. Reporting the
		// viewport's zoom there is what blew a low-res erase mask up to export size
		// — the white seams in the send preview.
		const rect = new Rect({ left: 0, top: 0, width: 100, height: 100 });
		let reported = 0;
		vi.spyOn(rect as any, "_render").mockImplementation(() => {
			reported = rect.getTotalObjectScaling().x;
		});

		const canvas = {
			getObjects: () => [rect],
			backgroundColor: "#fff",
			skipOffscreen: true,
			// The viewport the user happened to be sitting at. Must NOT leak in.
			getZoom: () => 0.2,
		};

		await exportBoundingBoxImage(canvas as any, { maxSize: 1000 });

		// 100px content (+1 stroke) + 50px padding on each side = 201 world units,
		// fitted into 1000px. Before the fix this was the zoom above: 0.2.
		expect(reported).toBeCloseTo(1000 / 201, 5);
	});

	it("leaves the object's own flags untouched", async () => {
		const rect = new Rect({ left: 0, top: 0, width: 100, height: 100 });
		rect.objectCaching = true;
		const scaling = rect.getTotalObjectScaling;
		vi.spyOn(rect as any, "_render").mockImplementation(() => undefined);

		await exportBoundingBoxImage(
			{
				getObjects: () => [rect],
				backgroundColor: "#fff",
				skipOffscreen: true,
			} as any,
			{ maxSize: 1000 },
		);

		expect(rect.objectCaching).toBe(true);
		expect(rect.getTotalObjectScaling).toBe(scaling);
	});
});
