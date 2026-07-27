import { describe, expect, it } from "vitest";
import {
	DRAW_RENDER_BACKEND_QUERY_KEY,
	resolveDrawRenderBackend,
} from "./renderBackend.config";

describe("draw render backend experiment", () => {
	it("defaults to the main-thread backend", () => {
		expect(resolveDrawRenderBackend("", null)).toBe("main");
	});

	it("uses a persisted valid backend", () => {
		expect(resolveDrawRenderBackend("", "main")).toBe("main");
		expect(resolveDrawRenderBackend("", "worker")).toBe("worker");
	});

	it("lets the A/B query parameter override persistence", () => {
		expect(
			resolveDrawRenderBackend(
				`?${DRAW_RENDER_BACKEND_QUERY_KEY}=main`,
				"worker",
			),
		).toBe("main");
	});

	it("ignores invalid query and persisted values", () => {
		expect(
			resolveDrawRenderBackend(`?${DRAW_RENDER_BACKEND_QUERY_KEY}=gpu`, "main"),
		).toBe("main");
		expect(resolveDrawRenderBackend("", "gpu")).toBe("main");
	});
});
