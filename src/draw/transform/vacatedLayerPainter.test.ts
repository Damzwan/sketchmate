import { describe, expect, it, vi } from "vitest";
import { paintVacatedLayer } from "./vacatedLayerPainter";

describe("paintVacatedLayer", () => {
	it("rasterizes a translucent background before the replacement objects", () => {
		const calls: string[] = [];
		const ctx = {
			fillStyle: "",
			clearRect: vi.fn(() => calls.push("clear")),
			fillRect: vi.fn(() => calls.push("background")),
			drawImage: vi.fn(() => calls.push("objects")),
		};
		const bitmap = {} as ImageBitmap;

		paintVacatedLayer(ctx, { width: 120, height: 80 }, "#faf0e680", bitmap);

		expect(calls).toEqual(["clear", "background", "objects"]);
		expect(ctx.fillStyle).toBe("#faf0e680");
		expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 120, 80);
		expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
	});

	it("keeps a transparent board transparent", () => {
		const ctx = {
			fillStyle: "",
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			drawImage: vi.fn(),
		};

		paintVacatedLayer(
			ctx,
			{ width: 20, height: 10 },
			"transparent",
			{} as ImageBitmap,
		);

		expect(ctx.fillRect).not.toHaveBeenCalled();
	});
});
