import { Group, Rect } from "fabric";
import { describe, expect, it, vi } from "vitest";
import {
	isolatedTileRenderer,
	isSplittableForBake,
	renderSplitForBake,
} from "./fabricTileRenderer";

/** Enough of a 2D context for fabric's Rect/Group render path. */
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

describe("isolatedTileRenderer group culling", () => {
	it("keeps the children that really are inside the tile", () => {
		// A merged drawing is a Group, and entering a group leaves each child's
		// cached aCoords in the WORLD plane while its transform becomes
		// group-relative — fabric only refreshes nested coords when
		// `subTargetCheck` is on. Measuring a child then returns a rect offset by
		// the group's centre, every child failed the tile test where it actually
		// is, and the whole merged drawing baked blank.
		const near = new Rect({ left: 100, top: 100, width: 50, height: 50 });
		const far = new Rect({ left: 900, top: 900, width: 50, height: 50 });
		near.getBoundingRect();
		far.getBoundingRect(); // populate the stale caches, as the index does

		const group = new Group([near, far]);
		const nearRender = vi.spyOn(near as any, "_render");
		const farRender = vi.spyOn(far as any, "_render");

		isolatedTileRenderer(stubContext(), group, 1, {
			x: 60,
			y: 60,
			w: 120,
			h: 120,
		});

		expect(nearRender).toHaveBeenCalled();
		expect(farRender).not.toHaveBeenCalled();
	});

	it("restores every flag it forced", () => {
		const child = new Rect({ left: 900, top: 900, width: 50, height: 50 });
		const group = new Group([child]);
		const visibleBefore = child.visible;

		isolatedTileRenderer(stubContext(), group, 1, { x: 0, y: 0, w: 10, h: 10 });

		expect(child.visible).toBe(visibleBefore);
		expect(group.visible).toBe(true);
	});
});

describe("yielded merged-group rendering", () => {
	it("opens a large group and yields between child batches", async () => {
		const children = Array.from(
			{ length: 48 },
			(_, i) => new Rect({ left: i * 2, top: 0, width: 1, height: 1 }),
		);
		const group = new Group(children);
		const renders = children.map((child) => vi.spyOn(child as any, "_render"));
		const yielder = {
			shouldYield: vi.fn(() => false),
			yield: vi.fn(async () => {}),
		};
		const timings: number[] = [];

		expect(isSplittableForBake(group)).toBe(true);
		await renderSplitForBake(
			stubContext(),
			group,
			1,
			undefined,
			yielder,
			() => false,
			(ms) => timings.push(ms),
		);

		expect(renders.every((spy) => spy.mock.calls.length === 1)).toBe(true);
		expect(yielder.yield).toHaveBeenCalledTimes(3);
		expect(timings).toHaveLength(48);
		expect(group._transformDone).toBeUndefined();
	});
});
