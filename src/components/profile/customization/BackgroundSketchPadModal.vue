<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @will-present="onPresent"
    class="liquid-sketch-modal"
  >
    <div
      class="editor-root relative h-full w-full overflow-hidden select-none"
      :style="{ background: 'var(--ion-color-tertiary)' }"
    >
      <div
        ref="viewportRef"
        class="absolute inset-0 touch-none"
        :class="tool === 'erase' ? 'cursor-cell' : 'cursor-crosshair'"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      >
        <div
          ref="worldRef"
          class="absolute top-0 left-0 origin-top-left will-change-transform"
          :style="worldStyle"
        >
          <div
            ref="cardWrapperRef"
            class="relative"
            :style="{ width: `${CANONICAL_CARD_WIDTH}px` }"
          >
            <div class="pointer-events-none" :style="{ opacity: cardOpacity }">
              <!-- disable-ambient drops ProfileWorld + ProfileEffect entirely.
                   Those are dozens of separate compositor layers (sprite canvases,
                   blur, mix-blend); freezing their animation doesn't help — the
                   cost is the GPU re-compositing all of them every frame the live
                   stroke repaints. Collapsing to a single flat card layer is what
                   makes drawing/zoom buttery. The theme bg + avatar + name (the
                   things you actually trace around) stay. -->
              <ProfileCard
                :user="user || {}"
                :customization="cardCustomization"
                :is-own-profile="false"
                :is-preview="true"
                :static-world="true"
                :static-avatar-decoration="true"
                :disable-ambient="true"
              />
            </div>

            <div
              ref="padRef"
              class="absolute pointer-events-none overflow-hidden"
              :style="{
                top: `${zoneRenderTop}px`,
                left: `${zoneRenderLeft}px`,
                width: `${zoneRenderWidth}px`,
                height: `${zoneRenderHeight}px`,
              }"
            >
              <!-- COMMITTED strokes only. SVG keeps them VECTOR → crisp at any
                   zoom; `non-scaling-stroke` holds width constant in the pad's
                   space (then the world scale makes it grow with zoom, matching
                   the live canvas). Cached via `committedPaths`, so this re-renders
                   only on commit/erase/undo — never during a drag. The in-progress
                   stroke is drawn on the screen-space canvas overlay below. -->
              <svg
                v-if="zoneRenderWidth > 0"
                class="absolute inset-0 w-full h-full"
                :viewBox="`0 0 ${CANONICAL_ZONE_WIDTH} ${CANONICAL_ZONE_HEIGHT}`"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  v-for="(p, i) in committedPaths"
                  :key="i"
                  :d="p.d"
                  fill="none"
                  :stroke="strokeColor"
                  :stroke-width="p.width"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                  :opacity="EDIT_OPACITY"
                />
              </svg>
            </div>

            <div
              v-if="zoneRenderWidth > 0"
              class="absolute pointer-events-none border-2 border-dashed rounded-md"
              :style="{
                top: `${zoneRenderTop}px`,
                left: `${zoneRenderLeft}px`,
                width: `${zoneRenderWidth}px`,
                height: `${zoneRenderHeight}px`,
                borderColor: strokeColor,
                opacity: 0.3,
              }"
            ></div>
          </div>
        </div>

        <!-- LIVE-STROKE OVERLAY: screen-space canvas, OUTSIDE the zoomed world.
             Redrawn on rAF (O(n) raster, no DOM/`d`-string reparse — that
             reparse was the O(n²) ramp on long detailed strokes). Zoom/pan is
             folded into the point mapping, so raster cost is flat at any zoom.
             Width/position match the committed in-world SVG → seamless pen-up. -->
        <canvas
          ref="liveCanvasRef"
          class="absolute inset-0 w-full h-full pointer-events-none"
        ></canvas>

        <div
          v-if="tool === 'erase' && eraserCursor.visible"
          class="absolute pointer-events-none rounded-full border-2 border-dashed -translate-x-1/2 -translate-y-1/2"
          :style="{
            left: `${eraserCursor.x}px`,
            top: `${eraserCursor.y}px`,
            width: `${eraserCursor.size}px`,
            height: `${eraserCursor.size}px`,
            borderColor: 'var(--ion-color-secondary)',
            background: 'rgba(var(--ion-color-secondary-rgb), 0.12)',
          }"
        ></div>
      </div>

      <div class="absolute top-0 inset-x-0 z-20 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div class="relative h-12 flex items-center justify-center">
          <ion-button
            fill="clear"
            color="dark"
            class="absolute left-0 ion-no-margin"
            @click="handleDismiss"
          >
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-xl" />
          </ion-button>

          <div class="text-center">
            <h1
              class="text-3xl text-secondary leading-none"
              :style="{ fontFamily: SKETCH_FONT }"
            >
              Card Doodle
            </h1>
            <p class="text-[9px] font-bold opacity-50 uppercase tracking-widest mt-0.5">
              Draw around your avatar &amp; name
            </p>
          </div>
        </div>
      </div>

      <div
        class="absolute z-20 inset-x-0 bottom-0 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pointer-events-none">
        <div
          class="pointer-events-auto rounded-3xl bg-white/95 border border-white/60 shadow-lg px-3 py-2 flex flex-col gap-2">

          <div class="flex items-center gap-1">
            <ion-button fill="clear" color="dark" class="ion-no-margin h-9 w-9" :disabled="!canUndo" @click="undo">
              <ion-icon slot="icon-only" :icon="svg(mdiUndoVariant)" class="text-xl" />
            </ion-button>
            <ion-button fill="clear" color="dark" class="ion-no-margin h-9 w-9" :disabled="!canRedo" @click="redo">
              <ion-icon slot="icon-only" :icon="svg(mdiRedoVariant)" class="text-xl" />
            </ion-button>

            <span class="text-[14px] cabin-sketch-regular ml-2">
              Pinch to zoom / drag to pan
            </span>

            <ion-button fill="clear" color="medium" size="small" class="ion-no-margin ml-auto pr-1"
                        @click="fitView(true)">
              <ion-icon slot="start" :icon="svg(mdiFitToScreenOutline)" class="text-lg mr-2" />
              <span class="text-[11px] font-bold tabular-nums">{{ zoomPct }}%</span>
            </ion-button>
          </div>

          <div class="flex items-center gap-3 px-0.5">
            <div class="custom-toggle-group shrink-0">
              <button
                type="button"
                class="toggle-btn"
                :class="{ active: tool === 'draw' }"
                @click="tool = 'draw'"
              >
                <ion-icon :icon="svg(mdiBrush)" class="text-base" />
              </button>
              <button
                type="button"
                class="toggle-btn"
                :class="{ active: tool === 'erase' }"
                @click="tool = 'erase'"
              >
                <ion-icon :icon="svg(mdiEraser)" class="text-base" />
              </button>
            </div>

            <span
              class="block rounded-full shrink-0 transition-all duration-100"
              :style="{
                width: `${sizeDotPx}px`,
                height: `${sizeDotPx}px`,
                backgroundColor: tool === 'erase' ? 'var(--ion-color-medium)' : strokeColor,
              }"
            ></span>

            <ion-range
              v-model="brushWidth"
              :min="MIN_BRUSH"
              :max="MAX_BRUSH"
              :step="1"
              color="secondary"
              class="flex-1 min-w-0 liquid-range"
            />

            <span class="text-[11px] font-bold tabular-nums text-dark/50 w-5 text-right shrink-0">
              {{ brushWidth }}
            </span>
          </div>

          <div class="flex items-center gap-2 mt-0.5">
            <ion-button
              fill="clear"
              color="medium"
              class="flex-1 ion-no-margin"
              :disabled="strokes.length === 0 && !isDrawing"
              @click="clear"
            >
              Clear
            </ion-button>

            <ion-button
              color="secondary"
              shape="round"
              class="flex-1 ion-no-margin"
              @click="applyOrUpgrade"
            >
              <template v-if="isPro || strokes.length === 0">
                Apply
              </template>

              <template v-else>
                <ion-icon slot="start" :icon="svg(mdiLock)" />
                Unlock Pro
              </template>
            </ion-button>
          </div>

          <p
            v-if="!isPro && strokes.length > 0"
            class="text-center text-[9px] font-bold text-secondary/70 uppercase tracking-widest pb-0.5 flex items-center justify-center gap-1"
          >
            <ion-icon :icon="svg(mdiLock)" class="text-xs" />
            Unlock Pro to save your doodle
          </p>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal, IonRange } from "@ionic/vue";
import {
	mdiBrush,
	mdiClose,
	mdiEraser,
	mdiFitToScreenOutline,
	mdiLock,
	mdiRedoVariant,
	mdiUndoVariant,
} from "@mdi/js";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import { svg } from "@/helper/general.helper";
import {
	type BackgroundSketchPadProps,
	useBackgroundSketchPadController,
} from "./useBackgroundSketchPadController";

const props = defineProps<BackgroundSketchPadProps>();
const emit = defineEmits<{
	(event: "close"): void;
	(event: "save", payload: { path: string; viewBox: string }): void;
}>();
const {
	CANONICAL_CARD_WIDTH,
	CANONICAL_ZONE_WIDTH,
	CANONICAL_ZONE_HEIGHT,
	MIN_BRUSH,
	MAX_BRUSH,
	SKETCH_FONT,
	EDIT_OPACITY,
	isPro,
	tool,
	brushWidth,
	cardOpacity,
	sizeDotPx,
	viewportRef,
	worldRef,
	cardWrapperRef,
	padRef,
	liveCanvasRef,
	zoneRenderTop,
	zoneRenderLeft,
	zoneRenderWidth,
	zoneRenderHeight,
	worldStyle,
	zoomPct,
	strokes,
	isDrawing,
	strokeColor,
	canUndo,
	canRedo,
	undo,
	redo,
	cardCustomization,
	fitView,
	onPresent,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onWheel,
	eraserCursor,
	clear,
	handleDismiss,
	committedPaths,
	applyOrUpgrade,
} = useBackgroundSketchPadController(props, emit);
</script>

<style scoped>
ion-modal.liquid-sketch-modal {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
  --background: var(--ion-color-tertiary);
}

/* Custom crisp tool toggle styling */
.custom-toggle-group {
  display: flex;
  background: rgba(var(--ion-color-light-rgb, 244, 245, 246), 0.85);
  padding: 3px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 32px;
  border-radius: 11px;
  border: none;
  background: transparent;
  color: var(--ion-color-medium);
  transition: all 0.15s ease;
  cursor: pointer;
}

.toggle-btn.active {
  background: #ffffff;
  color: var(--ion-color-secondary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.liquid-range {
  --bar-height: 5px;
  --knob-size: 20px;
  --height: 32px;
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>
