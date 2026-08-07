import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	emitMemoryPressure,
	installMemoryPressureBridge,
	levelFromNative,
	NATIVE_TRIM_MEMORY_EVENT,
	onMemoryPressure,
	TRIM_MEMORY_RUNNING_CRITICAL,
	TRIM_MEMORY_RUNNING_LOW,
	TRIM_MEMORY_RUNNING_MODERATE,
	TRIM_MEMORY_UI_HIDDEN,
	uninstallMemoryPressureBridge,
} from "./memoryPressure";

/**
 * Minimal `window` stand-in — the suite runs in the node environment, and this
 * module only needs the two listener methods plus dispatch.
 */
const listeners = new Map<string, Set<(e: Event) => void>>();

function dispatchTrim(level: unknown) {
	const event = { type: NATIVE_TRIM_MEMORY_EVENT, detail: { level } };
	for (const fn of listeners.get(NATIVE_TRIM_MEMORY_EVENT) ?? []) {
		fn(event as unknown as Event);
	}
}

beforeEach(() => {
	listeners.clear();
	(globalThis as any).window = {
		addEventListener(type: string, fn: (e: Event) => void) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)?.add(fn);
		},
		removeEventListener(type: string, fn: (e: Event) => void) {
			listeners.get(type)?.delete(fn);
		},
	};
});

afterEach(() => {
	uninstallMemoryPressureBridge();
	(globalThis as any).window = undefined;
});

describe("levelFromNative", () => {
	it("maps the ComponentCallbacks2 ladder", () => {
		expect(levelFromNative(TRIM_MEMORY_RUNNING_MODERATE)).toBe("moderate");
		expect(levelFromNative(TRIM_MEMORY_RUNNING_LOW)).toBe("low");
		expect(levelFromNative(TRIM_MEMORY_RUNNING_CRITICAL)).toBe("critical");
		expect(levelFromNative(TRIM_MEMORY_UI_HIDDEN)).toBe("uiHidden");
	});

	it("ignores levels below RUNNING_MODERATE", () => {
		expect(levelFromNative(0)).toBeNull();
		expect(levelFromNative(1)).toBeNull();
	});

	it("treats the deprecated background ladder as uiHidden or above", () => {
		// 40/60/80 are the old background tiers. They must not be dropped, and
		// they are at least as severe as UI_HIDDEN.
		expect(levelFromNative(40)).toBe("uiHidden");
		expect(levelFromNative(80)).toBe("uiHidden");
	});
});

describe("memory pressure bridge", () => {
	it("fans a native event out to subscribers", () => {
		const seen: string[] = [];
		installMemoryPressureBridge();
		onMemoryPressure((level) => seen.push(level));

		dispatchTrim(TRIM_MEMORY_RUNNING_CRITICAL);

		expect(seen).toEqual(["critical"]);
	});

	it("ignores a malformed payload", () => {
		const handler = vi.fn();
		installMemoryPressureBridge();
		onMemoryPressure(handler);

		dispatchTrim(undefined);
		dispatchTrim("15");

		expect(handler).not.toHaveBeenCalled();
	});

	it("registers exactly one window listener however often it is installed", () => {
		const handler = vi.fn();
		installMemoryPressureBridge();
		installMemoryPressureBridge();
		onMemoryPressure(handler);

		dispatchTrim(TRIM_MEMORY_RUNNING_LOW);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("stops delivering after unsubscribe", () => {
		const handler = vi.fn();
		const off = onMemoryPressure(handler);
		off();

		emitMemoryPressure("critical");

		expect(handler).not.toHaveBeenCalled();
	});

	it("keeps going when a handler throws", () => {
		const after = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const offBad = onMemoryPressure(() => {
			throw new Error("boom");
		});
		const offGood = onMemoryPressure(after);

		emitMemoryPressure("low");

		expect(after).toHaveBeenCalledTimes(1);
		offBad();
		offGood();
	});
});
