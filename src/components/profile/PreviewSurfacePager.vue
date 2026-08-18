<template>
  <div>

    <div class="flex justify-center gap-1.5 px-3 pb-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="preview-chip"
        :class="{ 'preview-chip--active': mode === tab.id }"
        @click="setMode(tab.id)"
      >
        <ion-icon :icon="svg(tab.icon)" class="text-[15px]" />
        {{ tab.label }}
      </button>
    </div>


    <div class="relative">
      <div
        ref="pagerRef"
        class="preview-pager hide-scrollbar"
        :style="pagerVars"
        @scroll.passive="onPagerScroll"
        @touchmove.stop
      >
        <section
          v-for="tab in tabs"
          :key="'pane' + tab.id"
          class="preview-pane"
          :style="{ height: `${paneHeight}px` }"
          @click.capture="onPaneClick(tab.id, $event)"
        >
          <!-- While the fullscreen overlay is up, freeze every pane so we never
               animate two copies of the same surface at once. -->
          <AmbientScope :active="mode === tab.id && !zoomOpen">
            <div
              v-if="visited.has(tab.id)"
              class="pane-zoom"
              :style="zoomStyle(tab.id)"
            >
              <PreviewSurface
                :mode="tab.id"
                :user="user"
                :customization="customization"
                :mock-post="mockPost"
                :mock-chat="mockChat"
                :mock-toast="mockToast"
              />
            </div>
          </AmbientScope>
        </section>
      </div>

      <!-- Expand → fullscreen. Only on the active pane, only when opted in. -->
      <button
        v-if="zoomable"
        class="preview-expand"
        aria-label="View fullscreen"
        @click="openZoom"
      >
        <ion-icon :icon="svg(mdiArrowExpand)" />
      </button>
    </div>

    <!-- Swipe position dots -->
    <div class="flex items-center justify-center gap-1.5 mt-2 mb-1">
      <button
        v-for="tab in tabs"
        :key="'dot' + tab.id"
        class="pager-dot"
        :class="{ 'pager-dot--active': mode === tab.id }"
        :aria-label="tab.label"
        @click="setMode(tab.id)"
      ></button>
    </div>

    <!-- Fullscreen zoom as a native ion-modal: proper backdrop + hardware/back
         button + swipe-to-dismiss instead of a hand-rolled overlay. Mounts ONE
         surface, only while open. A manual ambient hold (see script) freezes
         every background world in ALL host contexts, and this AmbientScope
         re-arms the foreground so only the zoomed surface keeps animating. -->
    <ion-modal
      :is-open="zoomOpen"
      class="ps-zoom-modal"
      @didDismiss="zoomOpen = false"
    >
      <div
        class="ps-zoom-overlay"
        :style="{ '--post-img-max-h': '48vh' }"
        @click.self="zoomOpen = false"
      >
        <button class="ps-zoom-close" aria-label="Close" @click="zoomOpen = false">
          <ion-icon :icon="svg(mdiClose)" />
        </button>

        <!-- Surface chips so the user can still switch Card/Post/Chat zoomed.
             Drive the overlay's OWN state — never the pager's mode. -->
        <div class="ps-zoom-chips">
          <button
            v-for="tab in tabs"
            :key="'z' + tab.id"
            class="preview-chip"
            :class="{ 'preview-chip--active': zoomMode === tab.id }"
            @click="zoomMode = tab.id"
          >
            <ion-icon :icon="svg(tab.icon)" class="text-[15px]" />
            {{ tab.label }}
          </button>
        </div>

        <div class="ps-zoom-stage" @click.self="zoomOpen = false">
          <AmbientScope :active="true">
            <PreviewSurface
              :mode="zoomMode"
              :user="user"
              :customization="customization"
              :mock-post="mockPost"
              :mock-chat="mockChat"
              :mock-toast="mockToast"
            />
          </AmbientScope>
        </div>
      </div>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonModal } from "@ionic/vue";
import { mdiArrowExpand, mdiClose } from "@mdi/js";
import AmbientScope from "@/components/general/AmbientScope.vue";
import PreviewSurface from "@/components/profile/PreviewSurface.vue";
import type { Customization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import { usePreviewSurfacePager } from "./usePreviewSurfacePager";

const props = withDefaults(
	defineProps<{
		user?: any;
		customization: Partial<Customization>;
		/** Host visibility. false → panes unmount (closed modals cost nothing);
     true → reset to Card and mount active+neighbor. */
		active?: boolean;
		/** Every pane box is exactly this tall — pick small (~260) for pick-and-
     apply modals where the item grid needs the room, larger (~420) for a
     dedicated preview sheet like the shop. */
		paneHeight?: number;
		/** Pane box width. Small pick-and-apply modals keep the default narrow
     peek; a dedicated preview sheet (shop) passes something wider like
     "min(92%, 480px)" so the look reads big while the next item still peeks. */
		paneWidth?: string;
		/** Cap for the Post surface's drawing image. Scale it up alongside a
     taller paneHeight so the post preview isn't a tiny letterbox. */
		postImgMaxHeight?: string;
		/** Per-surface zoom. Content width auto-compensates (100%/zoom), so any
     zoom still fills the pane; height crops at the bottom if it outgrows
     the box. */
		cardZoom?: number;
		postZoom?: number;
		chatZoom?: number;
		/** Show an expand control that blows the active surface up to a
     fullscreen overlay. Opt-in — only the shop's showcase wants it. */
		zoomable?: boolean;
	}>(),
	{
		active: true,
		paneHeight: 420,
		paneWidth: "min(76%, 340px)",
		postImgMaxHeight: "190px",
		cardZoom: 0.68,
		postZoom: 0.92,
		chatZoom: 1,
		zoomable: false,
	},
);

const {
	pagerVars,
	tabs,
	mode,
	zoomOpen,
	zoomMode,
	openZoom,
	zooms,
	zoomStyle,
	visited,
	pagerRef,
	setMode,
	onPaneClick,
	onPagerScroll,
	mockToast,
	mockPost,
	mockChat,
} = usePreviewSurfacePager(props);
</script>

<style scoped>

.preview-pager {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;

  --pane-w: min(76%, 340px); /* fallback; host overrides via :style */
  padding: 4px calc(50% - (var(--pane-w) / 2)) 0;
}

.preview-pane {
  flex: 0 0 var(--pane-w);
  scroll-snap-align: center;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  border-radius: 1.5rem;
  cursor: pointer;
}

.pane-zoom {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex-shrink: 0;
}

/* ── Expand button (bottom-right of the pager) ──────────────────────────── */
.preview-expand {
  position: absolute;
  right: 10px;
  bottom: 8px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.35);
  background: rgba(255, 255, 255, 0.9);
  color: var(--ion-color-secondary);
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: transform 0.15s ease;
  z-index: 5;
}
.preview-expand:active {
  transform: scale(0.9);
}

/* ── Fullscreen zoom overlay (fills the transparent ion-modal) ──────────── */
.ps-zoom-modal {
  --background: transparent;
  --box-shadow: none;
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
}

.ps-zoom-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(16px + var(--ion-safe-area-top, 0px)) 16px
    calc(16px + var(--ion-safe-area-bottom, 0px));
  background: rgba(24, 14, 8, 0.82);
  /* Single static layer — composited once, not per frame. */
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.ps-zoom-stage {
  width: 100%;
  max-width: 520px;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  /* Top-anchor so a tall surface (the Post card) scrolls fully instead of
     being centre-clipped with its header unreachable. */
  align-items: flex-start;
  justify-content: center;
}

.ps-zoom-chips {
  position: absolute;
  top: calc(12px + var(--ion-safe-area-top, 0px));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
}

.ps-zoom-close {
  position: absolute;
  top: calc(12px + var(--ion-safe-area-top, 0px));
  right: 14px;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  z-index: 2;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ── Chips ──────────────────────────────────────────────────────────── */
.preview-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 900;
  letter-spacing: -0.01em;
  border: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.35);
  background: #fff;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}
.preview-chip--active {
  background: var(--ion-color-secondary);
  border-color: var(--ion-color-secondary);
  color: #fff;
  box-shadow: 0 3px 10px rgba(var(--ion-color-secondary-rgb), 0.35);
  transform: scale(1.05);
}
.preview-chip:active {
  transform: scale(0.94);
}

/* ── Position dots ──────────────────────────────────────────────────── */
.pager-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  border: none;
  padding: 0;
  background: rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition:
    width 0.2s ease,
    background 0.2s ease;
}
.pager-dot--active {
  width: 18px;
  background: var(--ion-color-secondary);
}
</style>
