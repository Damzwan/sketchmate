<template>
  <ion-popover
    :is-open="smudgeMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="draw-menu-popover"
    side="top" alignment="center"
  >
    <div class="draw-menu bg-tertiary border border-primary/20">

      <div class="draw-menu-head">
        <!-- Says what the tool IS before showing a single dial. Smudge is the
             only tool here that paints nothing of its own, and a menu that
             opened straight onto sliders left people guessing. -->
        <div class="intro">
          <div class="intro_icon">
            <ion-icon :icon="svg(SMUDGE_ICON)" />
          </div>
          <div class="min-w-0">
            <p class="intro_title cabin-sketch-regular">Smudge</p>
            <p class="intro_sub">Drags the colours already on your drawing. No new paint.</p>
          </div>
        </div>

        <div ref="preview_stage" class="preview-stage border border-primary/10">
          <canvas ref="preview_canvas"></canvas>
          <span class="preview-tag">Live preview</span>
        </div>
      </div>

      <div class="draw-menu-body hide-scrollbar">
        <div class="control_card shadow-sm">
          <!-- Modes first: they change WHAT the tool does, the sliders only how
               much of it. -->
          <div class="mode_grid" role="group" aria-label="Smudge mode">
            <button
              v-for="option in SMUDGE_MODES"
              :key="option.value"
              type="button"
              class="mode_tile"
              :class="{ 'mode_tile--selected': mode === option.value }"
              :aria-pressed="mode === option.value"
              @click="mode = option.value"
            >
              <ion-icon :icon="svg(option.icon)" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </div>

          <p class="mode_hint">{{ activeMode.hint }}</p>

          <div class="card_divider"></div>

          <div class="control_row">
            <label class="control_label">Size</label>
            <ion-range aria-label="Smudge size" v-model="size"
                       :min="4" :max="120" :step="1" color="secondary" />
            <span class="value_pill">{{ size }}</span>
          </div>

          <div class="control_row">
            <label class="control_label">Strength</label>
            <ion-range aria-label="Smudge strength" v-model="strength"
                       :min="1" :max="100" color="secondary" />
            <span class="value_pill">{{ strength }}%</span>
          </div>
        </div>

        <p class="tip">
          Smudge works on what is already drawn, so it lands on top as its own
          layer — undo removes the smear, not the strokes under it.
        </p>

        <button type="button" class="back_button" @click="backToBrushes">
          <ion-icon :icon="svg(penIconMapping[brushType])" aria-hidden="true" />
          <span>Back to brushes</span>
        </button>
      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonIcon, IonPopover, IonRange } from "@ionic/vue";
import {
	mdiBlur,
	mdiGestureSwipeHorizontal,
	mdiGradientHorizontal,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { penIconMapping, SMUDGE_ICON } from "@/draw/config/tools.config";
import { usePen } from "@/draw/tools/pen.store";
import { useSmudge } from "@/draw/tools/smudge.store";
import { DrawTool, SmudgeMode } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { useSmudgePreview } from "./useSmudgePreview";

const { smudgeMenuOpen, menuEvent } = storeToRefs(useMenuStore());
const { openMenu, closeMenu } = useMenuStore();
const { size, strength, mode } = storeToRefs(useSmudge());
const { brushType } = storeToRefs(usePen());
const { selectTool } = useToolSelection();

const { previewCanvas: preview_canvas, previewStage: preview_stage } =
	useSmudgePreview();

const SMUDGE_MODES = [
	{
		value: SmudgeMode.Pull,
		label: "Pull",
		icon: mdiGestureSwipeHorizontal,
		hint: "Carries colour along your stroke, like a finger through wet paint.",
	},
	{
		value: SmudgeMode.Blur,
		label: "Blur",
		icon: mdiBlur,
		hint: "Softens whatever you pass over, without moving it anywhere.",
	},
	{
		value: SmudgeMode.Blend,
		label: "Blend",
		icon: mdiGradientHorizontal,
		hint: "Mixes the colours under the tip into one, for smooth gradients.",
	},
] as const;

const activeMode = computed(
	() => SMUDGE_MODES.find((m) => m.value === mode.value) ?? SMUDGE_MODES[0],
);

function backToBrushes() {
	closeMenu(Menu.Smudge);
	selectTool(DrawTool.Pen, { skipOpenMenu: true });
	openMenu(Menu.Pen);
}

function onDismiss() {
	smudgeMenuOpen.value = false;
}
</script>

<style scoped>
@reference "@/theme/main.css";

/* Shell, control rows, range, preview tag and scrollbar tokens are shared
   across the tool menus — see src/theme/draw-menu.css. */

.intro {
  @apply flex items-start gap-2 mb-1.5;
}

.intro_icon {
  @apply w-9 h-9 shrink-0 rounded-xl bg-secondary/15 text-secondary
  flex items-center justify-center;
}

.intro_icon ion-icon {
  @apply w-5 h-5;
}

.intro_title {
  @apply text-base font-black leading-none;
}

.intro_sub {
  @apply text-[11px] leading-snug text-black/55 mt-0.5;
}

.preview-stage {
  @apply relative rounded-xl overflow-hidden shadow-inner w-full;
}

.mode_grid {
  @apply grid grid-cols-3 gap-1;
}

.mode_tile {
  @apply flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl cursor-pointer
  bg-black/5 ring-1 ring-black/5 border-0 text-[10px] font-black uppercase tracking-wider
  text-black/60 active:scale-95 transition-all duration-150;
}

.mode_tile ion-icon {
  @apply w-4 h-4;
}

.mode_tile--selected {
  @apply bg-secondary/15 ring-2 ring-secondary text-secondary;
}

.mode_hint {
  @apply mt-1.5 text-[11px] leading-snug text-black/50 min-h-[2.1em];
}

.tip {
  @apply text-[10px] leading-snug text-black/40 px-1;
}

.back_button {
  @apply w-full px-3 py-2 rounded-xl bg-black/5 ring-1 ring-black/5 border-0
  flex items-center justify-center gap-2 cursor-pointer
  text-xs font-black text-black/60 active:scale-[0.99] transition-transform;
}

.back_button ion-icon {
  @apply w-4 h-4;
}
</style>
