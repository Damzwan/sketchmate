import { defineStore } from "pinia";
import { ref } from "vue";
import { LocalStorage } from "@/types/storage.types";

/**
 * Free strokes per locked brush, per day.
 *
 * A locked brush used to be a picture with a price on it: the pen menu drew a
 * canned preview stroke and asked for money. Nobody buys a tool they have never
 * held, and Neon and Calligraphy in particular are nothing like their thumbnail
 * until you draw with them.
 *
 * Six is enough to write a word or sign a name — the moment where the brush
 * either sells itself or doesn't — and far too few to produce a drawing with.
 * It resets daily so trying it once does not permanently burn the trial, which
 * is the state that makes people uninstall rather than buy.
 */
export const TRIAL_STROKES_PER_DAY = 6;

interface TrialRecord {
	day: string;
	used: Record<string, number>;
}

/** Local calendar day. The allowance is a courtesy, not an entitlement worth
 *  defending against a clock change. */
function today(): string {
	const now = new Date();
	return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function read(): TrialRecord {
	try {
		const raw = localStorage.getItem(LocalStorage.brushTrial);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<TrialRecord>;
			if (
				parsed?.day === today() &&
				parsed.used &&
				typeof parsed.used === "object"
			) {
				return { day: parsed.day, used: { ...parsed.used } };
			}
		}
	} catch {
		/* unreadable or from another version — start the day fresh */
	}
	return { day: today(), used: {} };
}

export const useBrushTrial = defineStore("brushTrial", () => {
	/** Reactive so the pen menu's "N left today" updates as strokes are spent. */
	const record = ref<TrialRecord>(read());

	function rollover(): void {
		if (record.value.day !== today()) record.value = { day: today(), used: {} };
	}

	function persist(): void {
		try {
			localStorage.setItem(
				LocalStorage.brushTrial,
				JSON.stringify(record.value),
			);
		} catch {
			// Private mode / quota. The in-memory count still governs this session,
			// which is the only thing a trial really has to get right.
		}
	}

	/** Strokes still free today for this shop item. */
	function remaining(itemId: string): number {
		rollover();
		return Math.max(
			0,
			TRIAL_STROKES_PER_DAY - (record.value.used[itemId] ?? 0),
		);
	}

	function canTry(itemId: string): boolean {
		return remaining(itemId) > 0;
	}

	/** Spend one stroke. Returns what is left AFTER it, so the caller can decide
	 *  whether the brush has to be handed back. */
	function consume(itemId: string): number {
		rollover();
		const used = (record.value.used[itemId] ?? 0) + 1;
		record.value = {
			day: record.value.day,
			used: { ...record.value.used, [itemId]: used },
		};
		persist();
		return Math.max(0, TRIAL_STROKES_PER_DAY - used);
	}

	return { remaining, canTry, consume };
});
