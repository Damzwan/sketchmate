import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { BLACK } from "@/draw/config/canvas.config";
import { usePen } from "@/draw/tools/pen.store";

const GRAY = "#808080FF";

export interface ColorProfile {
	color: string; // hex (opacity carried separately, like usePen.brushColor)
	opacity: number; // percent 0..100
}

/**
 * Two switchable color profiles (like the A/B color slots of a pro drawing
 * app). Both the pen and the bucket read usePen().brushColor + opacity, so a
 * profile is just a snapshot of those two — switching writes them into the pen
 * store, and any menu/eyedropper edit is mirrored back into the active slot so
 * each swatch remembers its own color.
 */
export const useColorProfiles = defineStore("colorProfiles", () => {
	const pen = usePen();

	const profiles = ref<ColorProfile[]>([
		{ color: BLACK, opacity: 100 },
		{ color: GRAY, opacity: 100 },
	]);
	const activeIndex = ref(0);

	function setActive(i: number) {
		if (i < 0 || i >= profiles.value.length) return;
		activeIndex.value = i;
		const p = profiles.value[i];
		pen.brushColor = p.color;
		pen.opacity = p.opacity;
	}

	// Edits land on usePen (color menu, eyedropper, bucket menu). Mirror them into
	// the active slot. Value-equality guard means the write from setActive() —
	// which matches the slot it just applied — is a no-op, so no feedback loop.
	watch(
		() => [pen.brushColor, pen.opacity] as const,
		([color, opacity]) => {
			const cur = profiles.value[activeIndex.value];
			if (cur.color === color && cur.opacity === opacity) return;
			profiles.value[activeIndex.value] = { color, opacity };
		},
	);

	return { profiles, activeIndex, setActive };
});
