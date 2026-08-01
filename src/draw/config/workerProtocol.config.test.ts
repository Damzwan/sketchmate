import { describe, expect, it } from "vitest";
import {
	resolveWorkerProtocolMode,
	WORKER_PROTOCOL_QUERY_KEY,
} from "./workerProtocol.config";

describe("worker protocol selection", () => {
	it("defaults to the revisioned protocol", () => {
		expect(resolveWorkerProtocolMode("", null)).toBe("v2");
	});

	it("keeps a legacy rollback mode", () => {
		expect(resolveWorkerProtocolMode("", "legacy")).toBe("legacy");
		expect(
			resolveWorkerProtocolMode(`?${WORKER_PROTOCOL_QUERY_KEY}=legacy`, "v2"),
		).toBe("legacy");
	});
});
