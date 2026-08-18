import { describe, expect, it } from "vitest";
import {
	QUALITY_DEMOTION_TTL_MS,
	resolveQualityDemotion,
} from "./qualityDemotion";

const NOW = 1_800_000_000_000;

describe("resolveQualityDemotion", () => {
	it("is off when nothing is stored", () => {
		expect(resolveQualityDemotion(null, NOW)).toBe(0);
		expect(resolveQualityDemotion("", NOW)).toBe(0);
	});

	it("reads a fresh record", () => {
		expect(
			resolveQualityDemotion(JSON.stringify({ level: 1, at: NOW - 1000 }), NOW),
		).toBe(1);
		expect(
			resolveQualityDemotion(JSON.stringify({ level: 2, at: NOW - 1000 }), NOW),
		).toBe(2);
	});

	it("expires so one bad session does not cost resolution forever", () => {
		const at = NOW - QUALITY_DEMOTION_TTL_MS - 1;
		expect(resolveQualityDemotion(JSON.stringify({ level: 2, at }), NOW)).toBe(
			0,
		);
	});

	it("ignores a record from the future rather than trusting it forever", () => {
		expect(
			resolveQualityDemotion(
				JSON.stringify({ level: 2, at: NOW + 60_000 }),
				NOW,
			),
		).toBe(0);
	});

	it("ignores malformed, out-of-range and non-JSON records", () => {
		expect(resolveQualityDemotion("not json", NOW)).toBe(0);
		expect(
			resolveQualityDemotion(JSON.stringify({ level: 5, at: NOW }), NOW),
		).toBe(0);
		expect(
			resolveQualityDemotion(JSON.stringify({ level: 0, at: NOW }), NOW),
		).toBe(0);
		expect(resolveQualityDemotion(JSON.stringify({ level: 1 }), NOW)).toBe(0);
		expect(resolveQualityDemotion(JSON.stringify([1, 2]), NOW)).toBe(0);
	});
});
