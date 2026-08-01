import { describe, expect, it } from "vitest";
import {
	estimateFabricPathBytes,
	getObjectPathStorageMetrics,
	summarizeObjectPathStorage,
} from "./pathStorage";

describe("path storage metrics", () => {
	it("uses compact introspection without reading the compatibility path", () => {
		let pathReads = 0;
		const object = {
			getCompactPathStorageInfo: () => ({
				commandCount: 239,
				coordinateCount: 952,
				payloadBytes: 4_047,
			}),
			get path() {
				pathReads++;
				return [];
			},
		};

		const metrics = getObjectPathStorageMetrics(object);

		expect(pathReads).toBe(0);
		expect(metrics?.mode).toBe("compact");
		expect(metrics?.estimatedFabricBytes).toBe(34_336);
		expect(metrics?.estimatedResidentBytes).toBe(4_175);
		expect(metrics?.estimatedSavingsBytes).toBe(30_161);
	});

	it("estimates normal Fabric command arrays from commands and coordinates", () => {
		const path = [
			["M", 1, 2],
			["Q", 3, 4, 5, 6],
		];
		const metrics = getObjectPathStorageMetrics({
			path,
		});

		expect(metrics).toEqual({
			mode: "fabric",
			commandCount: 2,
			coordinateCount: 6,
			geometryIdentity: path,
			payloadBytes: estimateFabricPathBytes(2, 6),
			estimatedResidentBytes: estimateFabricPathBytes(2, 6),
			estimatedFabricBytes: estimateFabricPathBytes(2, 6),
			estimatedSavingsBytes: 0,
		});
	});

	it("deduplicates shared compact buffers across nested clip paths", () => {
		const identity = {};
		const compactPath = () => ({
			getCompactPathStorageInfo: () => ({
				commandCount: 10,
				coordinateCount: 38,
				payloadBytes: 162,
				geometryIdentity: identity,
			}),
		});
		const root = {
			clipPath: { _objects: [compactPath(), compactPath()] },
		};

		const summary = summarizeObjectPathStorage([root]);

		expect(summary.pathObjectCount).toBe(2);
		expect(summary.compactPathCount).toBe(2);
		expect(summary.uniqueGeometryCount).toBe(1);
		expect(summary.estimatedResidentBytes).toBe(290);
		expect(summary.estimatedFabricBytes).toBe(
			estimateFabricPathBytes(10, 38) * 2,
		);
		expect(summary.estimatedSavingsBytes).toBe(
			summary.estimatedFabricBytes - 290,
		);
	});
});
