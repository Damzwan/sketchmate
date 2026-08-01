import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const manager = {
	getObjectBounds: vi.fn((object: any) => ({ ...object.bounds })),
	offsetQuadTree: vi.fn((object: any, dx: number, dy: number) => {
		object.bounds.x += dx;
		object.bounds.y += dy;
	}),
	translateMirror: vi.fn(),
	patchRectSync: vi.fn(),
	retainRegionsUntilRebaked: vi.fn(),
	withRetainedRemovalTiles: vi.fn((operation: () => void) => operation()),
	updateQuadTree: vi.fn(),
	beginBatch: vi.fn(),
	endBatch: vi.fn(),
};

let applyObjectModificationsBulk: typeof import("./objectHistory").applyObjectModificationsBulk;
let undoObjectAdded: typeof import("./objectHistory").undoObjectAdded;

beforeAll(async () => {
	vi.doMock("@/draw/canvas/drawObjectManager", () => ({
		useDrawObjectManager: () => manager,
	}));
	vi.doMock("@/draw/actions/drawActions", () => ({
		drawActionMapping: {},
	}));
	({ applyObjectModificationsBulk, undoObjectAdded } = await import(
		"./objectHistory"
	));
});

beforeEach(() => {
	vi.clearAllMocks();
});

function object(id: string, left: number, top: number) {
	const value: any = {
		id,
		left,
		top,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		bounds: { x: left, y: top, w: 20, h: 10 },
		set: vi.fn((patch: Record<string, number>) => Object.assign(value, patch)),
		setCoords: vi.fn(),
	};
	return value;
}

describe("object transform history", () => {
	it("applies a multi-object translation with one worker mirror delta", async () => {
		const first = object("first", 100, 50);
		const second = object("second", 140, 80);
		const objects = new Map([
			[first.id, first],
			[second.id, second],
		]);

		await applyObjectModificationsBulk(
			{
				getObjectById: (id: string) => objects.get(id),
			} as any,
			[
				{
					id: first.id,
					diff: { left: 12, top: -4, scaleX: 0, scaleY: 0, angle: 0 },
				},
				{
					id: second.id,
					diff: { left: 12, top: -4, scaleX: 0, scaleY: 0, angle: 0 },
				},
			],
		);

		expect(first.left).toBe(88);
		expect(first.top).toBe(54);
		expect(second.left).toBe(128);
		expect(second.top).toBe(84);
		expect(manager.offsetQuadTree).toHaveBeenCalledTimes(2);
		expect(manager.updateQuadTree).not.toHaveBeenCalled();
		expect(manager.translateMirror).toHaveBeenCalledOnce();
		expect(manager.translateMirror).toHaveBeenCalledWith(
			[first, second],
			-12,
			4,
		);
		expect(manager.patchRectSync).not.toHaveBeenCalled();
		expect(manager.retainRegionsUntilRebaked).toHaveBeenCalledOnce();
		expect(manager.retainRegionsUntilRebaked).toHaveBeenCalledWith([
			{ x: 92, y: 42, w: 76, h: 56 },
			{ x: 80, y: 46, w: 76, h: 56 },
		]);
	});
});

describe("object removal history", () => {
	it("keeps sharp committed tiles until an undone add is rebaked", async () => {
		const added = object("added", 10, 20);
		const remove = vi.fn();

		await undoObjectAdded(
			{
				canvas: { remove },
				getObjectById: () => added,
			} as any,
			{ params: { objectJSON: { id: added.id } } } as any,
		);

		expect(manager.withRetainedRemovalTiles).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledWith(added);
	});
});
