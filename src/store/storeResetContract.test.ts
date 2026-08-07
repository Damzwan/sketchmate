import { describe, expect, it, vi } from "vitest";
import { resetAllStores } from "./resetStores";

const NOT_A_STORE = /\.test\.ts$|resetStores\.ts$/;

// Raw source rather than the modules themselves: several stores reach for
// Capacitor, Firebase or `window` during setup, none of which exist here.
const sources = Object.entries(
	import.meta.glob("./*.ts", {
		query: "?raw",
		import: "default",
		eager: true,
	}) as Record<string, string>,
).filter(([file]) => !NOT_A_STORE.test(file));

/**
 * The store-reset contract.
 *
 * Logout calls `resetAllStores()` and nothing else, so a store that forgets
 * `resetRuntimeState` silently carries the previous account's data into the next
 * login — a memory leak, and a privacy bug that no other test would catch.
 *
 * If this fails for a store you just added, do not delete the case: add a
 * `resetRuntimeState` and decide what belongs to the account and what belongs to
 * the device. `network.store.ts` is the worked example of a considered no-op.
 */
describe("store reset contract", () => {
	it("finds the store modules", () => {
		expect(sources.length).toBeGreaterThan(15);
	});

	it.each(sources)("%s defines resetRuntimeState", (_file, source) => {
		expect(source).toMatch(/(function|const) resetRuntimeState\b/);
	});

	it.each(sources)("%s exposes resetRuntimeState", (_file, source) => {
		// Everything after the setup function's own `return {`. A definition that
		// is never returned is not reachable from `resetAllStores`.
		const returned = source.slice(source.lastIndexOf("\treturn {"));
		expect(returned).toContain("resetRuntimeState");
	});
});

describe("resetAllStores", () => {
	const fakePinia = (stores: Record<string, unknown>) =>
		({ _s: new Map(Object.entries(stores)) }) as never;

	it("calls resetRuntimeState on every instantiated store", () => {
		const a = vi.fn();
		const b = vi.fn();

		resetAllStores(fakePinia({ a: { resetRuntimeState: a }, plain: { b } }));

		expect(a).toHaveBeenCalledTimes(1);
		expect(b).not.toHaveBeenCalled();
	});

	it("keeps going when one store throws", () => {
		const after = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => {});

		resetAllStores(
			fakePinia({
				bad: {
					resetRuntimeState: () => {
						throw new Error("boom");
					},
				},
				good: { resetRuntimeState: after },
			}),
		);

		expect(after).toHaveBeenCalledTimes(1);
	});

	it("is a no-op without an active pinia", () => {
		expect(() => resetAllStores(undefined)).not.toThrow();
	});
});
