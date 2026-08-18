// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { forwardInstrumentWheel } from "@/draw/tools/instruments/instrumentWheel";

describe("instrument wheel forwarding", () => {
	it("replays desktop zoom input on Fabric's upper canvas", () => {
		const canvas = document.createElement("canvas");
		const listener = vi.fn();
		canvas.addEventListener("wheel", listener);
		const source = new WheelEvent("wheel", {
			cancelable: true,
			clientX: 240,
			clientY: 180,
			deltaX: 4,
			deltaY: -120,
			deltaMode: WheelEvent.DOM_DELTA_PIXEL,
			ctrlKey: true,
		});

		forwardInstrumentWheel(source, canvas);

		expect(source.defaultPrevented).toBe(true);
		expect(listener).toHaveBeenCalledOnce();
		const forwarded = listener.mock.calls[0]?.[0] as WheelEvent;
		expect(forwarded.target).toBe(canvas);
		expect(forwarded.clientX).toBe(240);
		expect(forwarded.clientY).toBe(180);
		expect(forwarded.deltaX).toBe(4);
		expect(forwarded.deltaY).toBe(-120);
		expect(forwarded.ctrlKey).toBe(true);
	});
});
