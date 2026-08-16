import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({
	// The web/test platform has no native app-state events; the plugin rejects
	// and `visibilitychange` carries the behaviour on its own.
	App: { addListener: () => Promise.reject(new Error("unsupported")) },
}));

import { emitMemoryPressure } from "@/service/memoryPressure";
import {
	HIDE_GRACE_MS,
	installDrawMemoryPressure,
	isDrawGraphicsReleased,
	UI_HIDDEN_GRACE_MS,
	uninstallDrawMemoryPressure,
} from "./drawMemoryPressure";

/** Comfortably past the grace period, whatever it is tuned to. */
const PAST_GRACE = HIDE_GRACE_MS + 1_000;

let visibility = "visible";

/**
 * Minimal `document` stand-in. The suite runs in the node environment (no
 * jsdom), and this module only needs visibilityState plus the three listener
 * methods — stubbing them is cheaper and more honest than pulling in a DOM.
 */
const listeners = new Map<string, Set<() => void>>();

function setVisibility(state: string): void {
	visibility = state;
	for (const fn of listeners.get("visibilitychange") ?? []) fn();
}

beforeEach(() => {
	vi.useFakeTimers();
	visibility = "visible";
	listeners.clear();
	(globalThis as any).document = {
		get visibilityState() {
			return visibility;
		},
		addEventListener(type: string, fn: () => void) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener(type: string, fn: () => void) {
			listeners.get(type)?.delete(fn);
		},
	};
});

afterEach(() => {
	uninstallDrawMemoryPressure();
	vi.useRealTimers();
	(globalThis as any).document = undefined;
});

describe("draw memory pressure", () => {
	it("releases only after the app stays hidden past the grace period", () => {
		const release = vi.fn();
		const restore = vi.fn();
		installDrawMemoryPressure({ release, restore });

		setVisibility("hidden");
		// A share sheet, a permission dialog or the notification shade all hide the
		// app for a moment — as does Android WebView during heavy main-thread work.
		// Releasing on those costs far more than it saves.
		vi.advanceTimersByTime(HIDE_GRACE_MS - 1_000);
		expect(release).not.toHaveBeenCalled();

		vi.advanceTimersByTime(2_000);
		expect(release).toHaveBeenCalledTimes(1);
		expect(isDrawGraphicsReleased()).toBe(true);
	});

	it("cancels a pending release when the app comes back quickly", () => {
		const release = vi.fn();
		const restore = vi.fn();
		installDrawMemoryPressure({ release, restore });

		setVisibility("hidden");
		vi.advanceTimersByTime(1_000);
		setVisibility("visible");
		vi.advanceTimersByTime(PAST_GRACE);

		expect(release).not.toHaveBeenCalled();
		// Nothing was released, so nothing needs restoring — a restore here would
		// trigger a pointless overview rebuild on every app switch.
		expect(restore).not.toHaveBeenCalled();
	});

	it("gives transient Android UI-hidden transitions a short grace", () => {
		const release = vi.fn();
		installDrawMemoryPressure({ release, restore: vi.fn() });

		emitMemoryPressure("uiHidden");

		vi.advanceTimersByTime(UI_HIDDEN_GRACE_MS - 1);
		expect(release).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(release).toHaveBeenCalledTimes(1);
		expect(isDrawGraphicsReleased()).toBe(true);
	});

	it("cancels a UI-hidden release when the compositor returns quickly", () => {
		const release = vi.fn();
		const restore = vi.fn();
		installDrawMemoryPressure({ release, restore });

		emitMemoryPressure("uiHidden");
		vi.advanceTimersByTime(UI_HIDDEN_GRACE_MS - 1_000);
		setVisibility("visible");
		vi.advanceTimersByTime(UI_HIDDEN_GRACE_MS);

		expect(release).not.toHaveBeenCalled();
		expect(restore).not.toHaveBeenCalled();
	});

	it.each([
		"low",
		"critical",
	] as const)("still releases immediately for Android %s memory pressure", (level) => {
		const release = vi.fn();
		installDrawMemoryPressure({ release, restore: vi.fn() });

		emitMemoryPressure("uiHidden");
		emitMemoryPressure(level);

		expect(release).toHaveBeenCalledTimes(1);
		expect(isDrawGraphicsReleased()).toBe(true);
	});

	it("restores exactly once after a real release", () => {
		const release = vi.fn();
		const restore = vi.fn();
		installDrawMemoryPressure({ release, restore });

		setVisibility("hidden");
		vi.advanceTimersByTime(PAST_GRACE);
		setVisibility("visible");
		setVisibility("visible");

		expect(release).toHaveBeenCalledTimes(1);
		expect(restore).toHaveBeenCalledTimes(1);
		expect(isDrawGraphicsReleased()).toBe(false);
	});

	it("does not release twice while still hidden", () => {
		const release = vi.fn();
		installDrawMemoryPressure({ release, restore: vi.fn() });

		setVisibility("hidden");
		vi.advanceTimersByTime(PAST_GRACE);
		setVisibility("hidden");
		vi.advanceTimersByTime(PAST_GRACE);

		expect(release).toHaveBeenCalledTimes(1);
	});

	it("stops listening after uninstall", () => {
		const release = vi.fn();
		installDrawMemoryPressure({ release, restore: vi.fn() });
		uninstallDrawMemoryPressure();

		setVisibility("hidden");
		vi.advanceTimersByTime(PAST_GRACE);

		expect(release).not.toHaveBeenCalled();
	});

	it("survives a release handler that throws", () => {
		// A failed release must not leave the engine unable to restore.
		const release = vi.fn(() => {
			throw new Error("boom");
		});
		const restore = vi.fn();
		installDrawMemoryPressure({ release, restore });

		setVisibility("hidden");
		vi.advanceTimersByTime(PAST_GRACE);
		setVisibility("visible");

		expect(restore).toHaveBeenCalledTimes(1);
	});
});

describe("release keeps the board paintable", () => {
	it("drops tiles but never the overview", async () => {
		// REGRESSION GUARD. Releasing the overview alongside the tiles leaves
		// `composite` with no source at all, so it paints bare background: the
		// drawing goes white and only returns as the user pans tiles back into
		// existence. The overview is ~4 MB against tens of MB of tiles, so keeping
		// it costs almost nothing and removes that failure mode outright.
		const { CommittedLayer } = await import("@/draw/rendering/committedLayer");
		const layer = new CommittedLayer<any>({ query: () => [] }, () => {}, {
			tileSize: 256,
			overviewPx: 64,
			memoryBudgetMB: 32,
		}) as any;

		let overviewReset = false;
		layer.overview.reset = () => {
			overviewReset = true;
		};
		layer.tiles.set(1, {
			bitmap: { close: () => {} } as unknown as ImageBitmap,
			tier: 4,
			tx: 0,
			ty: 0,
			bytes: 16,
			builtGen: 0,
			lastUsed: 0,
			usable: true,
			transition: false,
		});

		layer.releaseTiles();

		expect(layer.tiles.size).toBe(0);
		expect(overviewReset).toBe(false);
	});
});
