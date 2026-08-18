<template>
  <div>
    <!-- Surface chips — same control vocabulary as PreviewSurfacePager, so the
         Chat Style sheet reads as the same product as profile customization. -->
    <div class="flex justify-center gap-1.5 px-3 pb-1">
      <button
        v-for="page in pages"
        :key="page.id"
        type="button"
        class="preview-chip"
        :class="{ 'preview-chip--active': activePage === page.id }"
        @click="setPage(page.id)"
      >
        <ion-icon :icon="svg(page.icon)" class="text-[15px]" />
        {{ page.label }}
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
          v-for="page in pages"
          :key="'pane' + page.id"
          class="preview-pane"
          :style="{ height: `${paneHeight}px` }"
          @click.capture="onPaneClick(page.id, $event)"
        >
          <div class="pane-zoom" :style="zoomStyle">
            <ChatWidgetStylePreview
              :customization="customization"
              :user="user"
              :mode="page.id"
            />
          </div>
        </section>
      </div>

      <button
        class="preview-expand"
        type="button"
        aria-label="View fullscreen"
        @click="openZoom"
      >
        <ion-icon :icon="svg(mdiArrowExpand)" />
      </button>
    </div>

    <div class="flex items-center justify-center gap-1.5 mt-2 mb-1">
      <button
        v-for="page in pages"
        :key="'dot' + page.id"
        type="button"
        class="pager-dot"
        :class="{ 'pager-dot--active': activePage === page.id }"
        :aria-label="page.label"
        @click="setPage(page.id)"
      ></button>
    </div>

    <ion-modal
      :is-open="zoomOpen"
      class="ps-zoom-modal"
      @didDismiss="zoomOpen = false"
    >
      <div class="ps-zoom-overlay" @click.self="zoomOpen = false">
        <button class="ps-zoom-close" type="button" aria-label="Close" @click="zoomOpen = false">
          <ion-icon :icon="svg(mdiClose)" />
        </button>

        <!-- The overlay drives its OWN page state: switching chips while zoomed
             must not move the pager underneath, which desyncs on close. -->
        <div class="ps-zoom-chips">
          <button
            v-for="page in pages"
            :key="'z' + page.id"
            type="button"
            class="preview-chip"
            :class="{ 'preview-chip--active': zoomPage === page.id }"
            @click="zoomPage = page.id"
          >
            <ion-icon :icon="svg(page.icon)" class="text-[15px]" />
            {{ page.label }}
          </button>
        </div>

        <div ref="zoomStageRef" class="ps-zoom-stage" @click.self="zoomOpen = false">
          <div class="pane-zoom" :style="zoomOverlayStyle">
            <ChatWidgetStylePreview
              :customization="customization"
              :user="user"
              :mode="zoomPage"
            />
          </div>
        </div>
      </div>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonModal } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiChatOutline,
	mdiClose,
	mdiForumOutline,
} from "@mdi/js";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useSnapPager } from "@/composables/general/useSnapPager";
import type { ChatCustomization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import ChatWidgetStylePreview from "./ChatWidgetStylePreview.vue";

/** The preview lays out at the real widget's proportions and is then SCALED to
 * whatever box it is given. Re-flowing it into a short pane instead would change
 * type sizes and spacing relative to the real thing — i.e. preview the wrong
 * look. Keep these in sync with ChatWidgetStylePreview's design assumptions. */
const DESIGN_W = 320;
const DESIGN_H = 500;

type Page = "overview" | "conversation";

const props = withDefaults(
	defineProps<{
		customization?: Partial<ChatCustomization>;
		user?: any;
		modelValue?: Page;
		/** Pane box height. Kept modest — the option grid below is what the user is
     actually operating, and a 520px preview pushed it off-screen. The
     fullscreen control covers "let me really look at it". */
		paneHeight?: number;
	}>(),
	{ paneHeight: 320 },
);
const emit = defineEmits<{ "update:modelValue": [value: Page] }>();

const pages: { id: Page; label: string; icon: string }[] = [
	{ id: "overview", label: "Overview", icon: mdiForumOutline },
	{ id: "conversation", label: "In a chat", icon: mdiChatOutline },
];

const activePage = ref<Page>(props.modelValue ?? "overview");

const scale = computed(() => props.paneHeight / DESIGN_H);
const paneWidth = computed(() => Math.round(DESIGN_W * scale.value));
const pagerVars = computed(() => ({ "--pane-w": `${paneWidth.value}px` }));
const zoomStyle = computed(() => ({
	width: `${DESIGN_W}px`,
	height: `${DESIGN_H}px`,
	transform: `scale(${scale.value})`,
	transformOrigin: "top left",
}));

// ── Fullscreen ────────────────────────────────────────────────────────────
const zoomOpen = ref(false);
const zoomPage = ref<Page>("overview");
const zoomStageRef = ref<HTMLElement | null>(null);
const zoomScale = ref(1);

const zoomOverlayStyle = computed(() => ({
	width: `${DESIGN_W}px`,
	height: `${DESIGN_H}px`,
	transform: `scale(${zoomScale.value})`,
	transformOrigin: "top center",
}));

const measureZoom = () => {
	const el = zoomStageRef.value;
	if (!el) return;
	// Fit, never upscale past a comfortable reading size — a 500px-tall design
	// blown up to a tablet's full height just looks blurry-soft, not premium.
	zoomScale.value = Math.min(
		el.clientWidth / DESIGN_W,
		el.clientHeight / DESIGN_H,
		1.6,
	);
};

const openZoom = async () => {
	zoomPage.value = activePage.value;
	zoomOpen.value = true;
	await nextTick();
	// The modal animates in; measure once it has its final box.
	window.setTimeout(measureZoom, 60);
};
watch(zoomOpen, (open) => {
	if (open) window.addEventListener("resize", measureZoom);
	else window.removeEventListener("resize", measureZoom);
});

// ── Pager ─────────────────────────────────────────────────────────────────
const {
	pagerRef,
	setActive: setPage,
	onPaneClick,
	onPagerScroll,
} = useSnapPager(
	pages.map((page) => page.id),
	activePage,
	{
		onChange: (page) => emit("update:modelValue", page),
		restoreWhenVisible: true,
	},
);

watch(
	() => props.modelValue,
	(page) => {
		if (page && page !== activePage.value) setPage(page);
	},
);

onBeforeUnmount(() => {
	window.removeEventListener("resize", measureZoom);
});
</script>

<style scoped>
.preview-pager {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;

  --pane-w: 200px; /* fallback; host overrides via :style */
  padding: 4px calc(50% - (var(--pane-w) / 2)) 0;
}

.preview-pane {
  flex: 0 0 var(--pane-w);
  scroll-snap-align: center;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* NOT center: the child is laid out at the full DESIGN_W and only then scaled
     from its top-left. Centering the unscaled box would offset it by half the
     overflow before the transform ever ran. */
  align-items: flex-start;
  overflow: hidden;
  border-radius: 1.5rem;
  cursor: pointer;
}

.pane-zoom {
  flex-shrink: 0;
}

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
  padding: calc(64px + var(--ion-safe-area-top, 0px)) 16px
    calc(24px + var(--ion-safe-area-bottom, 0px));
  background: rgba(24, 14, 8, 0.82);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.ps-zoom-stage {
  width: 100%;
  max-width: 520px;
  height: 100%;
  display: flex;
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
