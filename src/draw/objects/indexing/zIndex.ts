import type { FabricObject } from "fabric";

export class ExplicitZIndex {
	private byId = new Map<string, number>();
	private byObject = new Map<FabricObject, number>();
	private top = -1;
	private bottom = 0;
	private dirty = true;

	constructor(
		private readonly getCanvasObjects: () => FabricObject[],
		private readonly objectsById: ReadonlyMap<string, FabricObject>,
	) {}

	get isDirty(): boolean {
		return this.dirty;
	}

	get objectMap(): Map<FabricObject, number> {
		if (!this.dirty) return this.byObject;
		this.byObject.clear();
		for (const [id, object] of this.objectsById) {
			const z = this.byId.get(id) ?? 0;
			this.byObject.set(object, z);
			(object as any).__z = z;
		}
		this.dirty = false;
		return this.byObject;
	}

	assignOnAdd(object: FabricObject): number {
		const objects = this.getCanvasObjects();
		const index = objects.indexOf(object);
		if (index === -1 || index === objects.length - 1) {
			return this.setObjectZ(object, ++this.top);
		}

		const below = this.neighborZ(objects, index - 1, -1);
		const above = this.neighborZ(objects, index + 1, 1);
		if (above === undefined) return this.setObjectZ(object, ++this.top);
		if (below === undefined) {
			const z = above - 1;
			this.bottom = Math.min(this.bottom, z);
			return this.setObjectZ(object, z);
		}

		const midpoint = (below + above) / 2;
		return this.setObjectZ(
			object,
			midpoint > below && midpoint < above ? midpoint : above,
		);
	}

	remove(object: FabricObject): void {
		this.byId.delete(object.id);
		if (!this.dirty) this.byObject.delete(object);
	}

	seed(objects: readonly FabricObject[]): void {
		this.reset();
		for (let index = 0; index < objects.length; index++) {
			const id = objects[index].id;
			if (!id) continue;
			this.byId.set(id, index);
			this.top = index;
		}
		this.dirty = true;
	}

	reset(): void {
		this.byId.clear();
		this.byObject.clear();
		this.top = -1;
		this.bottom = 0;
		this.dirty = true;
	}

	invalidate(): void {
		this.dirty = true;
	}

	get(ids: readonly string[]): number[] {
		return ids.map((id) => this.byId.get(id) ?? 0);
	}

	restore(ids: readonly string[], values: readonly number[]): void {
		for (let index = 0; index < ids.length; index++) {
			this.byId.set(ids[index], values[index]);
		}
		this.dirty = true;
	}

	toFront(ids: readonly string[]): void {
		for (const id of this.sortIds(ids)) this.byId.set(id, ++this.top);
		this.dirty = true;
	}

	toBack(ids: readonly string[]): void {
		for (const id of this.sortIds(ids).reverse()) {
			this.byId.set(id, --this.bottom);
		}
		this.dirty = true;
	}

	upOne(ids: readonly string[]): void {
		this.moveOne(ids, true);
	}

	downOne(ids: readonly string[]): void {
		this.moveOne(ids, false);
	}

	private setObjectZ(object: FabricObject, z: number): number {
		this.byId.set(object.id, z);
		(object as any).__z = z;
		if (!this.dirty) {
			this.byObject.set(object, z);
		}
		return z;
	}

	private neighborZ(
		objects: readonly FabricObject[],
		start: number,
		step: -1 | 1,
	): number | undefined {
		for (
			let index = start;
			index >= 0 && index < objects.length;
			index += step
		) {
			const id = objects[index].id;
			const z = id ? this.byId.get(id) : undefined;
			if (z !== undefined) return z;
		}
		return undefined;
	}

	private sortIds(ids: readonly string[]): string[] {
		return [...ids].sort(
			(a, b) => (this.byId.get(a) ?? 0) - (this.byId.get(b) ?? 0),
		);
	}

	private moveOne(ids: readonly string[], upward: boolean): void {
		const order = this.sortIds([...this.byId.keys()]);
		const positions = new Map(order.map((id, index) => [id, index]));
		const selected = new Set(ids);
		const chosen = [...ids].sort((a, b) => {
			const delta = (positions.get(a) ?? 0) - (positions.get(b) ?? 0);
			return upward ? -delta : delta;
		});

		for (const id of chosen) {
			const index = positions.get(id);
			const neighborIndex =
				index === undefined ? -1 : index + (upward ? 1 : -1);
			if (
				index === undefined ||
				neighborIndex < 0 ||
				neighborIndex >= order.length
			)
				continue;
			const neighbor = order[neighborIndex];
			if (selected.has(neighbor)) continue;

			const z = this.byId.get(id);
			const neighborZ = this.byId.get(neighbor);
			if (z === undefined || neighborZ === undefined) continue;
			this.byId.set(id, neighborZ);
			this.byId.set(neighbor, z);
			order[index] = neighbor;
			order[neighborIndex] = id;
			positions.set(neighbor, index);
			positions.set(id, neighborIndex);
		}
		this.dirty = true;
	}
}
