<template>
  <div>
    <!-- LAYER 1: BACKDROP (Dims & Blurs the app underneath) -->
    <Transition name="fade">
      <div
        v-if="balloonStore.receivedBalloon && hasLanded"
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-md pointer-events-auto"
      />
    </Transition>

    <!-- LAYER 2: FLOATING BALLOON ART (Visuals only, ignores clicks) -->
    <Transition name="float-down" @after-enter="handleLanded" @before-leave="handleBalloonLeave">
      <div
        v-if="balloonStore.receivedBalloon"
        class="fixed inset-0 z-[45] flex justify-center pointer-events-none"
        :class="isSuperShortScreen ? 'items-center pb-16' : 'items-center pb-24'"
      >
        <div class="flex flex-col items-center w-full max-w-[500px] px-4">

          <!-- BALLOON STRING/KNOT -->
          <Lottie
            :json="balloonLottie"
            :loop="true"
            :speed="0.5"
            class="drop-shadow-2xl"
            :class="isSuperShortScreen ? 'h-[10vh]' : (isVertical ? 'h-[14vh]' : 'h-[18vh]')"
          />

          <!-- CANVAS AREA (Frosted Frame) -->
          <div class="flex flex-col items-center w-full flex-1 min-h-0 relative">
            <div class="w-full flex justify-center shrink min-h-0 z-10">
              <div class="p-1.5 rounded-[2.5rem] bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl">
                <img
                  v-if="balloonStore.receivedBalloon.img"
                  :src="balloonStore.receivedBalloon.img"
                  alt="drawing"
                  class="object-contain rounded-[2rem] bg-white/90"
                  :class="[
                    'max-w-full w-auto h-auto',
                    isSuperShortScreen ? 'max-h-[25vh]' : (isVertical ? 'max-h-[35vh]' : 'max-h-[45vh]')
                  ]"
                />
              </div>
            </div>

            <!-- SENDER INFO & MESSAGE (Frosted Glass Card) -->
            <Transition name="fade-up">
              <div
                v-if="showDetails"
                class="flex flex-col items-center w-full -mt-6 z-20 min-h-0 pointer-events-auto"
              >
                <!-- Avatar Overlap -->
                <img
                  :src="balloonStore.senderInfo?.img"
                  class="w-12 h-12 rounded-full border-2 border-white/80 shadow-xl bg-white object-cover z-30"
                />

                <!-- Info Bubble -->
                <div class="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2rem] shadow-2xl w-full max-w-[280px] flex flex-col flex-1 min-h-0 -mt-6 pt-7">
                  <div class="flex-1 min-h-12 max-h-28 overflow-y-auto overflow-x-hidden px-5 py-4 text-center wrap-break-word">

                    <!-- If they left a message -->
                    <template v-if="balloonStore.receivedBalloon.message">
                      <span
                        class="cabin-sketch-regular font-bold text-white drop-shadow-md"
                        :class="isSuperShortScreen ? 'text-sm' : 'text-base sm:text-lg'"
                      >
                        "{{ balloonStore.receivedBalloon.message }}"
                      </span>
                    </template>

                    <!-- If it's just the drawing -->
                    <template v-else>
                      <span class="text-[10px] font-black uppercase tracking-widest text-white/70">
                        A sketch from {{ balloonStore.senderInfo?.name || 'a fellow patient' }}
                      </span>
                    </template>

                  </div>
                </div>
              </div>
            </Transition>
          </div>

        </div>
      </div>
    </Transition>

    <!-- LAYER 3: UI CONTROLS (Buttons & Headers) -->
    <Transition name="fade">
      <div
        v-if="balloonStore.receivedBalloon && showButtons"
        class="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between pt-safe pb-safe"
      >
        <!-- TOP ACTIONS & HEADER -->
        <div class="w-full pt-4 px-4 flex flex-col">

          <!-- Symmetric Top Pill Buttons -->
          <div class="flex items-center justify-between pointer-events-auto">
            <!-- Stop Receiving -->
            <button
              @click="disableConfirmationOpen = true"
              class="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg text-white active:bg-white/20 transition-all"
            >
              <ion-icon :icon="svg(mdiBellOffOutline)" class="text-sm opacity-80" />
              <span class="text-[10px] font-black uppercase tracking-widest">Turn Off</span>
            </button>

            <!-- Report -->
            <button
              @click="reportBalloon"
              class="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg text-red-100 active:bg-red-500/20 transition-all"
            >
              <ion-icon :icon="svg(mdiFlagVariantOutline)" class="text-sm opacity-80" />
              <span class="text-[10px] font-black uppercase tracking-widest">Report</span>
            </button>
          </div>

          <!-- QTE Title & Timer -->
          <div class="text-center mt-4 pointer-events-none">
            <p
              class="cabin-sketch-regular font-bold text-white drop-shadow-lg leading-none"
              :class="isSuperShortScreen ? 'text-2xl' : 'text-3xl'"
            >
              Balloon Incoming!
            </p>
            <div
              class="bg-white/20 backdrop-blur-md border border-white/10 shadow-inner rounded-full mt-3 mx-auto overflow-hidden"
              :class="isSuperShortScreen ? 'w-32 h-1.5' : 'w-48 h-1.5'"
            >
              <div class="h-full bg-white timer-shrink rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
            </div>
          </div>
        </div>

        <!-- BOTTOM ACTION DOCK -->
        <div class="w-full px-4 pb-4 pointer-events-auto flex justify-center">
          <div class="flex gap-3 w-full max-w-sm">
            <!-- Secondary Action: Float -->
            <button
              @click="balloonStore.refuseReceived"
              class="flex-1 h-16 rounded-[2rem] bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl active:bg-white/20 transition-all flex flex-col items-center justify-center"
            >
              <span class="text-[12px] font-black uppercase tracking-widest opacity-90">Let it float</span>
            </button>

            <!-- Primary Action: Catch -->
            <button
              @click="balloonStore.acceptReceived"
              class="flex-1 h-16 rounded-[2rem] bg-secondary/90 backdrop-blur-md border border-secondary/50 text-white shadow-xl active:scale-95 transition-all flex flex-col items-center justify-center"
            >
              <span class="text-[14px] font-black uppercase tracking-widest drop-shadow-md">Catch It</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- CONFIRMATION -->
    <ConfirmationAlert
      header="Stop Receiving Balloons?"
      message="You won't see new balloons float by, but you can turn this back on anytime."
      @confirm="balloonStore.disableBalloons"
      v-model:is-open="disableConfirmationOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { IonIcon } from "@ionic/vue";
import { mdiBellOffOutline, mdiFlagVariantOutline } from "@mdi/js";

import { useBalloonStore } from "@/store/balloon.store";
import { useModerationStore } from "@/store/moderation.store";
import { svg } from "@/helper/general.helper";

import balloonLottie from "@/assets/lottie/balloon.json";
import Lottie from "@/components/general/Lottie.vue";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";

// Provide a fallback avatar just in case

const balloonStore = useBalloonStore();
const disableConfirmationOpen = ref(false);

const hasLanded = ref(false);
const showDetails = ref(false);
const showButtons = ref(false);
const isVertical = ref(false);
const isSuperShortScreen = ref(false);

// Screen sizing
function checkScreenHeight() {
	isSuperShortScreen.value = window.innerHeight < 700;
}

onMounted(() => {
	checkScreenHeight();
	window.addEventListener("resize", checkScreenHeight);
});

onUnmounted(() => {
	window.removeEventListener("resize", checkScreenHeight);
});

// Image orientation
function checkImageOrientation(src: string) {
	const img = new Image();
	img.onload = () => {
		isVertical.value = img.height > img.width;
	};
	img.src = src;
}

watch(
	() => balloonStore.receivedBalloon,
	(val) => {
		if (val?.img) checkImageOrientation(val.img);
	},
);

// Animation Lifecycle
function handleLanded() {
	if (!balloonStore.receivedBalloon) return;
	hasLanded.value = true;

	const hasMessage = balloonStore.receivedBalloon.message?.trim().length > 0;

	// Slightly faster pop-in for QTE responsiveness
	setTimeout(() => {
		showDetails.value = true;
	}, 600);

	setTimeout(
		() => {
			showButtons.value = true;
		},
		hasMessage ? 1500 : 800,
	);
}

function handleBalloonLeave() {
	hasLanded.value = false;
	showDetails.value = false;
	showButtons.value = false;
}

// Report
function reportBalloon() {
	if (!balloonStore.receivedBalloon) return;
	useModerationStore().openReport({
		type: "balloon",
		id: balloonStore.receivedBalloon._id,
		label: `Balloon from ${balloonStore.senderInfo?.name || "Artist"}`,
	});
}
</script>

<style scoped>
/* Safe Areas */
.pt-safe {
  padding-top: env(safe-area-inset-top, 1rem);
}
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 1rem);
}

/* FLOAT */
.float-down-enter-active {
  transition: all 4s cubic-bezier(0.22, 1, 0.36, 1);
}
.float-down-leave-active {
  transition: all 0.5s ease-in;
}
.float-down-enter-from {
  opacity: 0;
  transform: translateY(-120vh) rotate(-10deg);
}
.float-down-enter-to {
  opacity: 1;
  transform: translateY(0) rotate(0deg);
}
.float-down-leave-to {
  opacity: 0;
  transform: translateY(-100px) scale(0.85);
}

/* FADE */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* FADE UP */
.fade-up-enter-active {
  transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-up-leave-active {
  transition: all 0.3s ease-in;
}
.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

/* TIMER */
.timer-shrink {
  width: 100%;
  transform-origin: left;
  animation: shrink-bar 50s linear forwards;
}

@keyframes shrink-bar {
  from { width: 100%; }
  to { width: 0%; }
}
</style>