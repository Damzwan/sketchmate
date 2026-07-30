import { describe, expect, it, vi } from "vitest";
import { stripClipStrokes } from "./eraseClip";

/** Minimal stand-in for a fabric object carrying a ClippingGroup clip. */
function objectWithClip(strokeIds: string[]) {
	const removed: any[] = [];
	const clip = {
		_objects: strokeIds.map((id) => ({ id })),
		remove: vi.fn((...items: any[]) => {
			removed.push(...items);
			for (const item of items) {
				const i = clip._objects.indexOf(item);
				if (i >= 0) clip._objects.splice(i, 1);
			}
		}),
		set: vi.fn(),
	};
	const obj: any = {
		clipPath: clip,
		set: vi.fn((k: any, v?: any) => {
			if (typeof k === "object") Object.assign(obj, k);
			else obj[k] = v;
		}),
	};
	return { obj, clip, removed };
}

describe("stripClipStrokes", () => {
	it("drops erases that are currently undone and keeps the rest", () => {
		// Object deleted while both A and B erased it, restored after B was undone:
		// B must not come back with the snapshot.
		const { obj, clip } = objectWithClip(["A", "B"]);

		stripClipStrokes(obj, new Set(["B"]));

		expect(clip._objects.map((o: any) => o.id)).toEqual(["A"]);
		expect(obj.clipPath).toBe(clip);
	});

	it("clears the clip entirely when every stroke was undone", () => {
		const { obj } = objectWithClip(["A", "B"]);

		stripClipStrokes(obj, new Set(["A", "B"]));

		expect(obj.clipPath).toBeUndefined();
	});

	it("leaves an untouched clip alone", () => {
		const { obj, clip } = objectWithClip(["A"]);

		stripClipStrokes(obj, new Set(["B"]));

		expect(clip.remove).not.toHaveBeenCalled();
		expect(obj.set).not.toHaveBeenCalled();
	});

	it("survives an object with no clip", () => {
		const obj: any = { set: vi.fn() };
		expect(() => stripClipStrokes(obj, new Set(["A"]))).not.toThrow();
	});
});
