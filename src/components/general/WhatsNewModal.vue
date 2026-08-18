<template>
  <ion-modal
    :is-open="isWhatsNewOpen"
    @didDismiss="isWhatsNewOpen = false"
    class="sketch-modal"
  >
    <div class="wn-paper bg-background p-4 overflow-y-auto max-h-[82vh] hide-scrollbar relative">
      <!-- Soft warm glow -->
      <div class="absolute -top-10 -right-10 w-28 h-28 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div class="relative flex flex-col gap-4">

        <!-- Close -->
        <div class="absolute -top-2 -right-2 z-20">
          <ion-button @click="isWhatsNewOpen = false" fill="clear" color="dark" class="m-0">
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
          </ion-button>
        </div>

        <!-- Header / Version -->
        <div class="wn-rise text-center">
          <h2 class="relative inline-block text-4xl font-bold cabin-sketch-regular tracking-wide text-secondary leading-none">
            What's New
            <!-- Hand-drawn underline squiggle -->
            <svg class="wn-squiggle absolute -bottom-2.5 left-1/2 -translate-x-1/2" width="130" height="10" viewBox="0 0 150 12" fill="none">
              <path d="M2 7C22 2 42 10 62 6C82 2 102 10 122 6C132 4 142 5 148 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </h2>
          <!-- Rubber stamp badge -->
          <div class="wn-stamp mt-3 mx-auto text-xs">
            v{{ appVersion }}
          </div>
        </div>

        <!-- Community note — pinned sketchbook note -->
        <div class="wn-rise wn-note relative bg-tertiary rounded-xl p-3.5 shadow-sm" style="--d: .06s">
          <span class="wn-tape" aria-hidden="true"></span>
          <div class="flex items-center gap-2.5 mb-2">
            <img
              width="40"
              height="40"
              loading="lazy"
              decoding="async"
              :src="bigbossImage"
              alt="Developer"
              class="w-10 h-10 rounded-full object-cover shadow-sm shrink-0"
              style="border: 2px solid var(--ion-color-secondary)"
            />
            <div class="leading-tight">
              <p class="text-lg font-black text-secondary cabin-sketch-regular leading-none">
                SketchMate Big Boss
              </p>
              <p class="text-xs uppercase tracking-wider text-black/70 mt-0.5">a note on this release</p>
            </div>
          </div>
          <p class="text-sm text-black/80 leading-relaxed">
            Packed with your top-requested features like new tools, safer drafts, and weekly competitions. Thanks for all the feedback :) ! ❤️
          </p>
        </div>

        <!-- Changelog Features — sketchbook list with dashed rail -->
        <div class="wn-list relative pl-1">
          <div
            v-for="(f, i) in features"
            :key="f.title"
            class="wn-rise wn-item flex gap-2.5 items-center"
            :style="{ '--d': 0.12 + i * 0.05 + 's' }"
          >
            <div class="wn-icon flex-shrink-0 w-10 h-10 flex items-center justify-center">
              <ion-icon :icon="svg(f.icon)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-lg leading-tight cabin-sketch-regular text-black/90">{{ f.title }}</h3>
              <p class="text-sm text-black/80 mt-0.5 leading-snug">{{ f.text }}</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="wn-rise flex flex-col" style="--d: .3s">
          <ion-button
            expand="block"
            class="cabin-sketch-regular text-xl tracking-wide m-0"
            shape="round"
            color="secondary"
            @click="isWhatsNewOpen = false"
          >
            Let's draw!
          </ion-button>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import {
	mdiAccountGroupOutline,
	mdiAt,
	mdiBookmarkOutline,
	mdiClose,
	mdiCloudCheckOutline,
	mdiEyeOffOutline,
	mdiRulerSquare,
	mdiTrophyOutline,
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
		icon: mdiTrophyOutline,
		title: "Art Competitions",
		text: "Weekly themes, prizes, and community voting.",
	},
	{
		icon: mdiAccountGroupOutline,
		title: "Artist Highlight",
		text: "Weekly featured artists, Q&As, and top posts.",
	},
	{
		icon: mdiRulerSquare,
		title: "More Drawing Tools",
		text: "Rulers, compasses, and reference guides for precision.",
	},
	{
		icon: mdiAt,
		title: "Post Tagging",
		text: "Tag creators on posts for collaborations and credit.",
	},
	{
		icon: mdiBookmarkOutline,
		title: "Save Posts",
		text: "Bookmark drawings privately directly to your profile.",
	},
	{
		icon: mdiEyeOffOutline,
		title: "Presence Control",
		text: "Set status to Invisible or Busy to quiet chat popups.",
	},
	{
		icon: mdiCloudCheckOutline,
		title: "Safer Drafts",
		text: "Reliable local drafts + automatic cloud backups for Pro.",
	},
];
</script>

<style scoped>
ion-modal.sketch-modal {
  --width: 90%;
  --max-width: 410px;
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
  padding: 3px 12px;
  border: 1.5px solid rgba(var(--ion-color-secondary-rgb), 0.65);
  border-radius: 6px;
  color: rgba(var(--ion-color-secondary-rgb), 0.85);
  font-family: "Cabin Sketch", sans-serif;
  font-weight: 700;
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

/* ── Changelog dashed rail + sketchy icon frames ── */
.wn-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wn-list::before {
  content: "";
  position: absolute;
  left: 20px;
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