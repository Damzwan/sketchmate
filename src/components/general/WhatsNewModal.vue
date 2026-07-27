<template>
  <ion-modal
    :is-open="isWhatsNewOpen"
    @didDismiss="isWhatsNewOpen = false"
    class="sketch-modal"
  >
    <div class="wn-paper bg-background p-5 pt-6 overflow-y-auto max-h-[85vh] hide-scrollbar relative">
      <!-- soft warm glow -->
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div class="relative flex flex-col gap-6">

        <!-- Close -->
        <div class="absolute -top-1 -right-1 z-20">
          <ion-button @click="isWhatsNewOpen=false" fill="clear" color="dark" class="m-0">
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
          </ion-button>
        </div>

        <!-- Header / Version -->
        <div class="wn-rise text-center pt-1">
          <h2 class="relative inline-block text-4xl font-bold cabin-sketch-regular tracking-wide text-secondary leading-none">
            What's New
            <!-- hand-drawn underline squiggle -->
            <svg class="wn-squiggle absolute -bottom-3 left-1/2 -translate-x-1/2" width="150" height="12" viewBox="0 0 150 12" fill="none">
              <path d="M2 7C22 2 42 10 62 6C82 2 102 10 122 6C132 4 142 5 148 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </h2>
          <!-- inked rubber stamp -->
          <div class="wn-stamp mt-5 mx-auto">
            v{{ appVersion }}
          </div>
        </div>

        <!-- Big Boss Solo Dev Message — pinned sketchbook note -->
        <div class="wn-rise wn-note relative bg-tertiary rounded-2xl px-4 py-4 shadow-md mt-1" style="--d: .06s">
          <span class="wn-tape" aria-hidden="true"></span>
          <div class="flex items-center gap-3 mb-2.5">
            <img
              :src="bigbossImage"
              alt="Developer"
              class="w-11 h-11 rounded-full object-cover shadow-sm shrink-0"
              style="border: 2.5px solid var(--ion-color-secondary)"
            />
            <div class="leading-tight">
              <p class="text-lg font-black text-secondary cabin-sketch-regular leading-none">
                SketchMate Big Boss
              </p>
              <p class="text-[11px] uppercase tracking-widest text-black/80 mt-1">a note from the solo dev</p>
            </div>
          </div>
          <div class="text-[15px] text-black/80 leading-relaxed space-y-2.5">
            <p>
              Hey! I'm the solo dev behind SketchMate. Over the last 2 years, I've poured thousands of hours and my own money into this app.
            </p>
            <p>
              To keep it alive, mostly free, and ad-free, I'm introducing monetization through customization. It's a big shift, but the only way to cover the running costs.
            </p>
          </div>

          <!-- Gift sticker -->
          <div class="wn-gift mt-3">
            <div class="flex items-center gap-2 mb-1.5">
              <ion-icon :icon="svg(mdiGiftOutline)" class="text-xl text-secondary" />
              <p class="cabin-sketch-regular text-lg font-black text-secondary leading-none">A thank-you, from me to you</p>
            </div>
            <p class="text-[15px] text-black/80 leading-relaxed">
              Existing users get an exclusive <b>"Gratitude"</b> World,  a <b>"Crumbled Paper"</b> profile effect and a <b>"Early Tester"</b> title that can <i>never</i> be bought. Past donors get a <b>lifetime subscription</b>. ❤️
            </p>
          </div>
        </div>

        <!-- Changelog Features — sketchbook list with dashed rail -->
        <div class="wn-list relative pl-1 mt-1">
          <div
            v-for="(f, i) in features"
            :key="f.title"
            class="wn-rise wn-item flex gap-3 items-center"
            :style="{ '--d': 0.12 + i * 0.07 + 's' }"
          >
            <div class="wn-icon flex-shrink-0 w-11 h-11 flex items-center justify-center">
              <ion-icon :icon="svg(f.icon)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-black/90">{{ f.title }}</h3>
              <p class="text-[15px] text-black/80 mt-0.5 leading-snug">{{ f.text }}</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="wn-rise flex flex-col gap-3 mt-2" style="--d: .5s">
          <ion-button
            expand="block"
            class="cabin-sketch-regular text-xl tracking-wide m-0"
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
import { IonModal, IonButton, IonIcon } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useMenuStore } from "@/store/menu.store";
import { svg } from "@/helper/general.helper";
import {
	mdiAccountGroupOutline,
	mdiBrushVariant,
	mdiShieldCheckOutline,
	mdiPaletteOutline,
	mdiLayersOutline,
	mdiClose,
	mdiGiftOutline,
} from "@mdi/js";
import bigbossImage from "@/assets/bigboss.jpg";

const menuStore = useMenuStore();
const { isWhatsNewOpen } = storeToRefs(menuStore);

const appVersion = __APP_VERSION__;

const features = [
	{
		icon: mdiAccountGroupOutline,
		title: "Social",
		text: "Posts, chatting, reacting, and a non-addictive chronological feed.",
	},
	{
		icon: mdiPaletteOutline,
		title: "Better Drawing",
		text: "Improved drawing engine, significantly less lag, and new tools.",
	},
	{
		icon: mdiShieldCheckOutline,
		title: "Community Safety",
		text: "Reporting, blocking, and private drawing areas within public lobbies.",
	},
	{
		icon: mdiBrushVariant,
		title: "Customization",
		text: "Extensive new ways to personalize your profile and presence.",
	},
	{
		icon: mdiLayersOutline,
		title: "Reworked UI",
		text: "A cleaner, faster, and more polished interface across the app.",
	},
];
</script>

<style scoped>
ion-modal.sketch-modal {
  --width: 92%;
  --max-width: 420px;
  --height: fit-content;
  --border-radius: 28px;
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
  transform: rotate(-4deg);
  padding: 3px 12px;
  border: 2px solid rgba(var(--ion-color-secondary-rgb), 0.65);
  border-radius: 8px;
  color: rgba(var(--ion-color-secondary-rgb), 0.85);
  font-family: "Cabin Sketch", sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  box-shadow: inset 0 0 0 1px rgba(var(--ion-color-secondary-rgb), 0.25);
}

/* ── Dev note: pinned paper, slightly askew with a strip of tape ── */
.wn-note {
  transform: rotate(-0.6deg);
  border: 1.5px solid rgba(var(--ion-color-secondary-rgb), 0.18);
}
.wn-tape {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%) rotate(-2.5deg);
  width: 74px;
  height: 20px;
  background: rgba(var(--ion-color-secondary-rgb), 0.14);
  border: 1px dashed rgba(var(--ion-color-secondary-rgb), 0.3);
  border-radius: 2px;
}

/* ── Gift sticker: torn-paper highlight ── */
.wn-gift {
  padding: 10px 12px;
  border-radius: 12px;
  border: 2px dashed rgba(var(--ion-color-secondary-rgb), 0.45);
  background: rgba(var(--ion-color-secondary-rgb), 0.06);
}

/* ── Changelog dashed rail + sketchy icon frames ── */
.wn-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.wn-list::before {
  content: "";
  position: absolute;
  left: 22px;
  top: 8px;
  bottom: 8px;
  border-left: 2px dashed rgba(var(--ion-color-secondary-rgb), 0.22);
}
.wn-icon {
  border: 2px solid rgba(var(--ion-color-secondary-rgb), 0.35);
  border-radius: 14px 12px 15px 11px; /* wobbly hand-drawn corners */
  background: var(--ion-color-tertiary);
}
.wn-item:nth-child(even) .wn-icon { transform: rotate(3deg); }
.wn-item:nth-child(odd) .wn-icon { transform: rotate(-3deg); }

/* ── Entrance: staggered rise-in ── */
@keyframes wn-rise-kf {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.wn-rise {
  opacity: 0;
  animation: wn-rise-kf 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--d, 0s);
}
/* keep the note's tilt after it rises in */
.wn-note.wn-rise { animation-name: wn-note-rise-kf; }
@keyframes wn-note-rise-kf {
  from { opacity: 0; transform: translateY(10px) rotate(-0.6deg); }
  to   { opacity: 1; transform: translateY(0) rotate(-0.6deg); }
}

/* squiggle draws itself in */
@keyframes wn-draw { from { stroke-dashoffset: 320; } to { stroke-dashoffset: 0; } }
.wn-squiggle path {
  stroke-dasharray: 320;
  stroke-dashoffset: 320;
  animation: wn-draw 0.9s ease-out 0.35s forwards;
}

@media (prefers-reduced-motion: reduce) {
  .wn-rise { opacity: 1; animation: none; }
  .wn-squiggle path { stroke-dashoffset: 0; animation: none; }
}
</style>
