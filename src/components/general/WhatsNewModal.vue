<template>
  <ion-modal
    :is-open="isWhatsNewOpen"
    @didDismiss="isWhatsNewOpen = false"
    class="sketch-modal"
  >
    <div class="wn-paper bg-background p-4 pt-5 overflow-y-auto max-h-[82vh] hide-scrollbar relative">
      <!-- Soft warm glow -->
      <div class="absolute -top-10 -right-10 w-28 h-28 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div class="relative flex flex-col gap-4">

        <!-- Close -->
        <div class="absolute -top-2 -right-2 z-20">
          <ion-button @click="isWhatsNewOpen=false" fill="clear" color="dark" class="m-0">
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-xl" />
          </ion-button>
        </div>

        <!-- Header / Version -->
        <div class="wn-rise text-center">
          <h2 class="relative inline-block text-3xl font-bold cabin-sketch-regular tracking-wide text-secondary leading-none">
            What's New
            <!-- Hand-drawn underline squiggle -->
            <svg class="wn-squiggle absolute -bottom-2.5 left-1/2 -translate-x-1/2" width="120" height="10" viewBox="0 0 150 12" fill="none">
              <path d="M2 7C22 2 42 10 62 6C82 2 102 10 122 6C132 4 142 5 148 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </h2>
          <!-- Rubber stamp badge -->
          <div class="wn-stamp mt-3 mx-auto">
            v{{ appVersion }}
          </div>
        </div>

        <!-- Community note — pinned sketchbook note -->
        <div class="wn-rise wn-note relative bg-tertiary rounded-xl p-3.5 shadow-sm" style="--d: .06s">
          <span class="wn-tape" aria-hidden="true"></span>
          <div class="flex items-center gap-2.5 mb-2">
            <img
              :src="bigbossImage"
              alt="Developer"
              class="w-9 h-9 rounded-full object-cover shadow-sm shrink-0"
              style="border: 2px solid var(--ion-color-secondary)"
            />
            <div class="leading-tight">
              <p class="text-base font-black text-secondary cabin-sketch-regular leading-none">
                SketchMate Big Boss
              </p>
              <p class="text-[10px] uppercase tracking-wider text-black/70 mt-0.5">a note to everyone supporting SketchMate</p>
            </div>
          </div>
          <p class="text-xs text-black/80 leading-relaxed">
            Thank you for <b>1,000+ posts</b> and <b>100k+ messages</b>! v0.4.4 strengthens the foundation so SketchMate can keep growing reliably. ❤️
          </p>

          <!-- Next-release teaser — torn dashed box -->
          <div class="wn-next mt-2.5 p-2">
            <div class="flex items-center gap-1.5 mb-0.5">
              <ion-icon :icon="svg(mdiTrophyOutline)" class="text-base text-secondary shrink-0" />
              <p class="cabin-sketch-regular text-sm font-black text-secondary leading-none">Next up: Drawing competitions</p>
            </div>
            <p class="text-xs text-black/80 leading-tight">
              Get your brushes ready. 🏆
            </p>
          </div>
        </div>

        <!-- Changelog Features — sketchbook list with dashed rail -->
        <div class="wn-list relative pl-1">
          <div
            v-for="(f, i) in features"
            :key="f.title"
            class="wn-rise wn-item flex gap-2.5 items-center"
            :style="{ '--d': 0.12 + i * 0.05 + 's' }"
          >
            <div class="wn-icon flex-shrink-0 w-9 h-9 flex items-center justify-center">
              <ion-icon :icon="svg(f.icon)" class="text-lg text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-base leading-tight cabin-sketch-regular text-black/90">{{ f.title }}</h3>
              <p class="text-xs text-black/80 mt-0.5 leading-snug">{{ f.text }}</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="wn-rise flex flex-col" style="--d: .3s">
          <ion-button
            expand="block"
            class="cabin-sketch-regular text-lg tracking-wide m-0"
            shape="round"
            color="secondary"
            @click="isWhatsNewOpen = false"
          >
            Let's draw! ✏️
          </ion-button>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import {
	mdiChatProcessingOutline,
	mdiClose,
	mdiLayersOutline,
	mdiTrophyOutline,
	mdiWrenchCheckOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import bigbossImage from "@/assets/bigboss.jpg";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";

const menuStore = useMenuStore();
const { isWhatsNewOpen } = storeToRefs(menuStore);

const appVersion = __APP_VERSION__;

const features = [
	{
		icon: mdiLayersOutline,
		title: "Layers",
		text: "Create, rename, reorder, hide, and lock layers for complex drawings.",
	},
	{
		icon: mdiChatProcessingOutline,
		title: "Your Chat, Your Style",
		text: "Customize your chat widget with themes, fonts, effects, and styles.",
	},
	{
		icon: mdiWrenchCheckOutline,
		title: "A Stronger Engine",
		text: "Smoother drawing, lower memory use, faster loading, and bug fixes.",
	},
];
</script>

<style scoped>
ion-modal.sketch-modal {
  --width: 90%;
  --max-width: 390px;
  --height: fit-content;
  --border-radius: 24px;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.bg-background {
  background-color: var(--ion-color-background);
}

/* ── Inked rubber-stamp version badge ── */
.wn-stamp {
  display: inline-block;
  transform: rotate(-3deg);
  padding: 2px 10px;
  border: 1.5px solid rgba(var(--ion-color-secondary-rgb), 0.65);
  border-radius: 6px;
  color: rgba(var(--ion-color-secondary-rgb), 0.85);
  font-family: "Cabin Sketch", sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: inset 0 0 0 1px rgba(var(--ion-color-secondary-rgb), 0.2);
}

/* ── Dev note: pinned paper ── */
.wn-note {
  transform: rotate(-0.5deg);
  border: 1.5px solid rgba(var(--ion-color-secondary-rgb), 0.18);
}
.wn-tape {
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 56px;
  height: 15px;
  background: rgba(var(--ion-color-secondary-rgb), 0.14);
  border: 1px dashed rgba(var(--ion-color-secondary-rgb), 0.3);
  border-radius: 2px;
}

/* ── Next-release teaser: torn-paper highlight box ── */
.wn-next {
  border-radius: 10px;
  border: 1.5px dashed rgba(var(--ion-color-secondary-rgb), 0.45);
  background: rgba(var(--ion-color-secondary-rgb), 0.06);
}

/* ── Changelog dashed rail + sketchy icon frames ── */
.wn-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wn-list::before {
  content: "";
  position: absolute;
  left: 18px;
  top: 6px;
  bottom: 6px;
  border-left: 2px dashed rgba(var(--ion-color-secondary-rgb), 0.22);
}
.wn-icon {
  border: 1.5px solid rgba(var(--ion-color-secondary-rgb), 0.35);
  border-radius: 10px 8px 11px 8px; /* hand-drawn corners */
  background: var(--ion-color-tertiary);
}
.wn-item:nth-child(even) .wn-icon { transform: rotate(2.5deg); }
.wn-item:nth-child(odd) .wn-icon { transform: rotate(-2.5deg); }

/* ── Entrance: staggered rise-in ── */
@keyframes wn-rise-kf {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.wn-rise {
  opacity: 0;
  animation: wn-rise-kf 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--d, 0s);
}
.wn-note.wn-rise { animation-name: wn-note-rise-kf; }
@keyframes wn-note-rise-kf {
  from { opacity: 0; transform: translateY(8px) rotate(-0.5deg); }
  to   { opacity: 1; transform: translateY(0) rotate(-0.5deg); }
}

/* Squiggle animation */
@keyframes wn-draw { from { stroke-dashoffset: 320; } to { stroke-dashoffset: 0; } }
.wn-squiggle path {
  stroke-dasharray: 320;
  stroke-dashoffset: 320;
  animation: wn-draw 0.8s ease-out 0.2s forwards;
}

@media (prefers-reduced-motion: reduce) {
  .wn-rise { opacity: 1; animation: none; }
  .wn-squiggle path { stroke-dashoffset: 0; animation: none; }
}
</style>