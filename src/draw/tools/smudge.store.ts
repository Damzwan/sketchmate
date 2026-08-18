import type { Canvas } from "fabric";
import { defineStore } from "pinia";
import { type Ref, ref, watch } from "vue";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import { updateFreeDrawingCursor } from "@/draw/tools/cursor";
import { SmudgeMode, type ToolService } from "@/draw/tools/tool.types";
import { SmudgeBrush } from "@/draw/utils/brushes/SmudgeBrush";
import { useToast } from "@/service/toast.service";

interface Smudge extends ToolService {
	size: Ref<number>;
	strength: Ref<number>;
	mode: Ref<SmudgeMode>;
	updateCursor: () => void;
}

/**
 * Smudge is a TOOL, not a brush.
 *
 * It lived in the pen menu's brush grid first, and that was wrong in a way the
 * UI kept having to apologise for: every other entry there paints a colour, and
 * this one has no colour, no opacity and no colour picker. Its own tool means
 * its own settings, its own menu and no dead controls.
 *
 * It shares the pen's dock slot (see PENMENUTOOLS) rather than claiming a new
 * button, because the toolbar has no room for one.
 */
export const useSmudge = defineStore("smudge", (): Smudge => {
	let c: Canvas | undefined;

	const size = ref(28);
	const strength = ref(60);
	const mode = ref<SmudgeMode>(SmudgeMode.Pull);

	const events: FabricEvent[] = [
		{ on: "mouse:down", handler: updateCursor },
		{ on: "zoomChanged", handler: updateCursor },
		{ on: "zoomReset", handler: updateCursor },
		{
			// The brush cannot sample a canvas tainted by a cross-origin image, and
			// refuses the stroke up front instead of losing it at commit time.
			on: "smudge:blocked",
			handler: () =>
				useToast().toast("Smudge can't read this drawing's imported image", {
					color: "warning",
				}),
		},
	];

	function init(canvas: Canvas) {
		c = canvas;
	}

	function destroy() {
		c = undefined;
	}

	async function select() {
		if (!c) return;
		c.isDrawingMode = true;
		c.skipTargetFind = true;
		c.selection = false;
		c.freeDrawingBrush = new SmudgeBrush(c);
		applySettings();
		updateCursor();
	}

	function applySettings() {
		const brush = c?.freeDrawingBrush as SmudgeBrush | undefined;
		if (!(brush instanceof SmudgeBrush)) return;
		brush.width = size.value;
		brush.smudgeStrength = strength.value;
		brush.smudgeMode = mode.value;
	}

	/**
	 * A hollow ring, not a filled disc. Every other free-drawing cursor here is
	 * filled with the colour it is about to lay down; smudge lays down none, and
	 * a coloured disc would promise paint that never arrives.
	 */
	function updateCursor() {
		if (!c?.freeDrawingBrush) return;
		updateFreeDrawingCursor(c, size.value, "#00000022", true);
	}

	watch([size, strength, mode], () => {
		applySettings();
		updateCursor();
	});

	return { select, init, destroy, events, size, strength, mode, updateCursor };
});
