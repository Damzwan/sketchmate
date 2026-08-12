import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	TRIAL_STROKES_PER_DAY,
	useBrushTrial,
} from "@/draw/tools/brushTrial.store";

const NEON = "brush.neon";

function stubLocalStorage() {
	const store = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
		removeItem: (key: string) => store.delete(key),
	});
	return store;
}

describe("brush trial allowance", () => {
	beforeEach(() => {
		stubLocalStorage();
		setActivePinia(createPinia());
	});

	it("hands out a fixed number of strokes per brush per day", () => {
		const trial = useBrushTrial();
		expect(trial.remaining(NEON)).toBe(TRIAL_STROKES_PER_DAY);
		expect(trial.canTry(NEON)).toBe(true);

		for (let i = 1; i <= TRIAL_STROKES_PER_DAY; i++) {
			expect(trial.consume(NEON)).toBe(TRIAL_STROKES_PER_DAY - i);
		}
		expect(trial.canTry(NEON)).toBe(false);
		// Spending past zero must not go negative and re-open the trial.
		expect(trial.consume(NEON)).toBe(0);
		expect(trial.remaining(NEON)).toBe(0);
	});

	it("counts each brush separately", () => {
		const trial = useBrushTrial();
		trial.consume(NEON);
		expect(trial.remaining(NEON)).toBe(TRIAL_STROKES_PER_DAY - 1);
		expect(trial.remaining("brush.calligraphy")).toBe(TRIAL_STROKES_PER_DAY);
	});

	it("survives a reload within the same day", () => {
		useBrushTrial().consume(NEON);
		setActivePinia(createPinia());
		expect(useBrushTrial().remaining(NEON)).toBe(TRIAL_STROKES_PER_DAY - 1);
	});

	it("starts fresh when the stored day is not today", () => {
		const store = stubLocalStorage();
		store.set(
			"brush_trial",
			JSON.stringify({ day: "1999-1-1", used: { [NEON]: 99 } }),
		);
		setActivePinia(createPinia());
		expect(useBrushTrial().remaining(NEON)).toBe(TRIAL_STROKES_PER_DAY);
	});

	it("still gates the session when storage refuses writes", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			setItem: () => {
				throw new Error("QuotaExceeded");
			},
			removeItem: () => undefined,
		});
		setActivePinia(createPinia());
		const trial = useBrushTrial();
		for (let i = 0; i < TRIAL_STROKES_PER_DAY; i++) trial.consume(NEON);
		expect(trial.canTry(NEON)).toBe(false);
	});
});
