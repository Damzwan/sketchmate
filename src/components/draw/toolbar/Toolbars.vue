<template>
  <div
    class="absolute inset-0 pointer-events-none flex flex-col justify-between pt-[env(safe-area-inset-top,16px)] pb-[env(safe-area-inset-bottom,16px)] px-4 z-10">

    <!-- data-draw-chrome marks the edges a floating panel (references) must not
         be dropped under; measured by measureDrawChrome(). -->
    <div data-draw-chrome="top" class="flex justify-between items-start pointer-events-none mt-3">

      <Transition name="hud-fade">
        <div v-if="!isFullscreen" class="pointer-events-auto">
          <div
            class="p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg flex items-center justify-center">
            <ToolButton
              :icon="svg(mdiChevronLeft)"
              @click="goBack"
              custom-class="hover:bg-primary/20"
            />
          </div>
        </div>
      </Transition>

      <div class="pointer-events-auto grid items-start justify-items-end">
        <Transition name="hud-fade">
          <div
            v-if="isFullscreen"
            key="exit-btn"
            class="delay-enter col-start-1 row-start-1 p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg flex items-center justify-center"
          >
            <ToolButton
              :icon="svg(mdiFullscreenExit)"
              @click="isFullscreen = false"
              custom-class="hover:bg-primary/20"
            />
          </div>

          <TopManagement
            v-else
            key="mgmt-pill"
            class="col-start-1 row-start-1"
            @toggle-fullscreen="isFullscreen = true"
            @start-benchmark="emit('start-benchmark')"
          />
        </Transition>
      </div>
    </div>

    <div data-draw-chrome="bottom" class="flex justify-center pointer-events-none w-full mb-6">
      <div class="pointer-events-auto">
        <Transition name="dock-morph" mode="out-in">
          <component :is="activeDockComponent" :key="activeDockComponent.__name" />
        </Transition>
      </div>
    </div>

    <!-- A/B color slots — bottom-right, active only in pen/bucket mode. -->
    <ColorSwatches />

    <!-- Persistent canvas utilities. Instruments are independent of the active
         brush; placing them beside Layers keeps them visible without widening
         the already-dense primary tool dock. -->
    <div
      data-draw-chrome="right"
      class="fixed z-40 flex flex-col items-end gap-2 pointer-events-auto"
      :style="{
        right: 'calc(0.75rem + env(safe-area-inset-right))',
        bottom: 'calc(6rem + env(safe-area-inset-bottom))',
      }"
    >
      <InstrumentControl />
      <LayerControl />
    </div>

  </div>
</template>

<script setup lang="ts">
import { mdiChevronLeft, mdiFullscreenExit } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import InstrumentControl from "@/components/draw/instruments/InstrumentControl.vue";
import LayerControl from "@/components/draw/layers/LayerControl.vue";
import ColorSwatches from "@/components/draw/toolbar/ColorSwatches.vue";
import ToolButton from "@/components/draw/toolbar/ToolButton.vue";
import ToolDockClaimArea from "@/components/draw/toolbar/ToolDockClaimArea.vue";
import ToolDockColorPicker from "@/components/draw/toolbar/ToolDockColorPicker.vue";
import ToolDockDraw from "@/components/draw/toolbar/ToolDockDraw.vue";
import ToolDockSelect from "@/components/draw/toolbar/ToolDockSelect.vue";
import ToolDockText from "@/components/draw/toolbar/ToolDockText.vue";
import TopManagement from "@/components/draw/toolbar/TopManagement.vue";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { useSelect } from "@/draw/tools/select.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { svg } from "@/helper/general.helper";

const emit = defineEmits(["start-benchmark"]);

const { addTextMode, colorPickerMode, isFullscreen } = storeToRefs(
	useDrawUIStore(),
);
const { triggerManualExit } = useDrawUIStore();
const { isSelectActive } = storeToRefs(useSelect());
const { isClaiming } = storeToRefs(useClaimArea());

const goBack = () => triggerManualExit();

const activeDockComponent = computed(() => {
	// Picking is a modal state over whatever tool was active, so it outranks
	// every other dock — the only controls that make sense are cancel and the
	// live reading.
	if (colorPickerMode.value) return ToolDockColorPicker;
	if (isClaiming.value) return ToolDockClaimArea;
	if (addTextMode.value) return ToolDockText;
	if (isSelectActive.value) return ToolDockSelect;
	return ToolDockDraw;
});
</script>

<style scoped>
.hud-fade-enter-active {
  transition: all 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}

/* This is the magic: The entering button waits for the pill to leave */
.hud-fade-enter-active.delay-enter {
  transition-delay: 0.15s;
}

.hud-fade-leave-active {
  transition: all 0.2s ease-in;
}

.hud-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
}

.hud-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

/* Bottom dock morphing */
.dock-morph-enter-active,
.dock-morph-leave-active {
  transition: all 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

.dock-morph-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.dock-morph-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>
