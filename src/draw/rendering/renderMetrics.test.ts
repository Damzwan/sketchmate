import { beforeEach, describe, expect, it } from "vitest";
import {
	initDrawMetrics,
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
});
