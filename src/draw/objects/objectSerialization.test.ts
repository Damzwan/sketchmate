import type { FabricObject } from "fabric";
import { describe, expect, it, vi } from "vitest";
import {
	markObjectMutated,
	objectMutationRevision,
	serializeAtRevision,
} from "./objectSerialization";

describe("object mutation revisions", () => {
	it("changes whenever a worker snapshot can become stale", () => {
		const object = {} as FabricObject;

		expect(objectMutationRevision(object)).toBe(0);
		markObjectMutated(object);
		markObjectMutated(object);

		expect(objectMutationRevision(object)).toBe(2);
	});

	it("reuses JSON until the mutation revision changes", () => {
		const toJSON = vi
			.fn()
			.mockReturnValueOnce({ left: 1 })
			.mockReturnValueOnce({ left: 2 });
		const object = { toJSON } as unknown as FabricObject;

		expect(serializeAtRevision(object)).toEqual({ left: 1 });
		expect(serializeAtRevision(object)).toEqual({ left: 1 });
		expect(toJSON).toHaveBeenCalledOnce();

		markObjectMutated(object);

		expect(serializeAtRevision(object)).toEqual({ left: 2 });
		expect(toJSON).toHaveBeenCalledTimes(2);
	});
});
