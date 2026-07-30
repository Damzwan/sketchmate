import { beforeEach, describe, expect, it } from "vitest";
import {
	initDrawMetrics,
	recordComposite,
	recordWorkerCancelRequests,
	recordWorkerCancelResult,
	resetDrawMetrics,
	snapshotDrawMetrics,
} from "./renderMetrics";

describe("draw worker cancellation metrics", () => {
	beforeEach(() => resetDrawMetrics());

	it("separates acknowledged cancels from late worker results", () => {
		recordWorkerCancelRequests(2);
		recordWorkerCancelResult(12.345, true);
		recordWorkerCancelResult(3, false);

		const metrics = snapshotDrawMetrics();
		expect(metrics.workerCancelRequests).toBe(2);
		expect(metrics.workerCancelAcks).toBe(1);
		expect(metrics.workerCancelLateResults).toBe(1);
		expect(metrics.workerCancelMsMax).toBe(12.35);
		expect(metrics.workerCancelMsMean).toBe(7.67);
	});

	it("labels snapshots with the active render backend", () => {
		initDrawMetrics(
			() => 2,
			() => "main",
		);

		const metrics = snapshotDrawMetrics();
		expect(metrics.renderBackend).toBe("main");
		expect(metrics.device.renderDpr).toBe(2);
	});

	it("reports tile cache pressure without allocating diagnostics objects", () => {
		recordComposite(4, 2, 1, 24, 80, 60 * 1024 * 1024, 64 * 1024 * 1024, 8, 2);

		const metrics = snapshotDrawMetrics();
		expect(metrics.tileCacheCount).toBe(80);
		expect(metrics.tileMemoryMB).toBe(60);
		expect(metrics.tileMemoryLimitMB).toBe(64);
		expect(metrics.tileMemoryPressure).toBe(0.94);
		expect(metrics.dirtyTiles).toBe(8);
		expect(metrics.inFlightTiles).toBe(2);
	});
});
