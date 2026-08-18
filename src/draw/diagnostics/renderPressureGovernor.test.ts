import { describe, expect, it } from "vitest";
import { decideDemotion } from "./renderPressureGovernor";

const QUIET = {
	longTaskMsMax: 120,
	longTaskMsTotal: 900,
	uptimeMs: 300_000,
	severeBlocks: 0,
	current: 0 as const,
};

describe("decideDemotion", () => {
	it("leaves a healthy session alone", () => {
		expect(decideDemotion(QUIET)).toBe(0);
	});

	it("does not demote on a single severe block", () => {
		expect(decideDemotion({ ...QUIET, severeBlocks: 1 })).toBe(0);
	});

	it("demotes one step after repeated near-ANR blocks", () => {
		expect(decideDemotion({ ...QUIET, severeBlocks: 2 })).toBe(1);
	});

	it("demotes one step on sustained lesser blocking", () => {
		expect(
			decideDemotion({ ...QUIET, longTaskMsTotal: 40_000, uptimeMs: 300_000 }),
		).toBe(1);
	});

	it("ignores the blocking fraction on a session too short to trust it", () => {
		expect(
			decideDemotion({ ...QUIET, longTaskMsTotal: 20_000, uptimeMs: 60_000 }),
		).toBe(0);
	});

	it("goes straight to the floor when both signals fire", () => {
		expect(
			decideDemotion({
				...QUIET,
				severeBlocks: 2,
				longTaskMsTotal: 40_000,
				uptimeMs: 300_000,
			}),
		).toBe(2);
	});

	it("goes to the floor when an already-demoted device still blocks", () => {
		expect(decideDemotion({ ...QUIET, severeBlocks: 2, current: 1 })).toBe(2);
	});

	it("never lowers an existing demotion", () => {
		expect(decideDemotion({ ...QUIET, current: 2 })).toBe(2);
		expect(decideDemotion({ ...QUIET, current: 1 })).toBe(1);
	});
});
