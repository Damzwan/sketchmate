<template>
  <div
    class="absolute inset-0 pointer-events-none flex flex-col justify-between pt-[env(safe-area-inset-top,16px)] pb-[env(safe-area-inset-bottom,16px)] px-4 z-10">

    <div class="flex justify-between items-start pointer-events-none mt-3">

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
          />
        </Transition>
      </div>
    </div>

    <div class="flex justify-center pointer-events-none w-full mb-6">
      <div class="pointer-events-auto">
        <Transition name="dock-morph" mode="out-in">
          <component :is="activeDockComponent" :key="activeDockComponent.__name" />
        </Transition>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { mdiChevronLeft, mdiFullscreenExit } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useSelect } from '@/draw/store/tools/select.store'
import TopManagement from '@/components/draw/toolbar/TopManagement.vue'
import ToolDockText from '@/components/draw/toolbar/ToolDockText.vue'
import ToolDockSelect from '@/components/draw/toolbar/ToolDockSelect.vue'
import ToolDockDraw from '@/components/draw/toolbar/ToolDockDraw.vue'
import ToolButton from '@/components/draw/toolbar/ToolButton.vue'

const { addTextMode, isFullscreen } = storeToRefs(useDrawUIStore())
const { triggerManualExit } = useDrawUIStore()
const { isSelectActive } = storeToRefs(useSelect())

const goBack = () => triggerManualExit()

const activeDockComponent = computed(() => {
  if (addTextMode.value) return ToolDockText
  if (isSelectActive.value) return ToolDockSelect
  return ToolDockDraw
})
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