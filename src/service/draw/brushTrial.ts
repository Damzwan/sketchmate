import { Preferences } from "@capacitor/preferences";
import { ref } from "vue";
import type { BrushType } from "@/draw/tools/tool.types";

const BRUSH_USAGE_KEY_PREFIX = "brush_usage_";
const LAST_RESET_KEY = "brush_usage_last_reset";
const FREE_TRIAL_LIMIT = 3;

export function useBrushTrial() {
	// Store all counts in a single reactive record
	const trialCounts = ref<Record<string, number>>({});

	const getTodayString = () => new Date().toISOString().split("T")[0];

	/**
	 * Checks if the date has changed. If so, it wipes relevant keys.
	 * Capacitor Preferences doesn't support glob deletion easily,
	 * so we update the date and let individual brushes reset as they are loaded.
	 */
	const handleDailyReset = async () => {
		const today = getTodayString();
		const { value: lastReset } = await Preferences.get({ key: LAST_RESET_KEY });

		if (lastReset !== today) {
			// Clear local state immediately
			trialCounts.value = {};
			await Preferences.set({ key: LAST_RESET_KEY, value: today });
			return true;
		}
		return false;
	};

	const loadUsage = async (type: BrushType) => {
		const isNewDay = await handleDailyReset();
		const key = `${BRUSH_USAGE_KEY_PREFIX}${type}`;

		if (isNewDay) {
			// It's a new day, so regardless of what's in storage, this brush is at 0
			await Preferences.remove({ key });
			trialCounts.value[type] = 0;
			return 0;
		}

		const { value } = await Preferences.get({ key });
		const count = value ? parseInt(value, 10) : 0;
		trialCounts.value[type] = count;
		return count;
	};

	const useBrush = async (type: BrushType): Promise<boolean> => {
		// Ensure we have the latest data/reset state before checking
		const currentCount = await loadUsage(type);

		if (currentCount < FREE_TRIAL_LIMIT) {
			const newCount = currentCount + 1;
			await Preferences.set({
				key: `${BRUSH_USAGE_KEY_PREFIX}${type}`,
				value: newCount.toString(),
			});

			// Update reactive state
			trialCounts.value[type] = newCount;
			return true;
		}

		return false;
	};

	const getRemaining = (type: BrushType) => {
		const used = trialCounts.value[type] ?? 0;
		return Math.max(0, FREE_TRIAL_LIMIT - used);
	};

	return {
		useBrush,
		loadUsage,
		getRemaining,
		limit: FREE_TRIAL_LIMIT,
		trialCounts, // Exposed for debugging or global UI indicators
	};
}
