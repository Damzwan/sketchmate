<template>
  <div>
    <Transition name="fade">
      <div
        v-if="balloonStore.receivedBalloon && hasLanded"
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-md pointer-events-auto"
      />
    </Transition>

    <Transition
      name="float-down"
      appear
      @after-enter="handleLanded"
      @before-leave="handleBalloonLeave"
    >
      <div
        v-if="balloonStore.receivedBalloon"
        class="fixed inset-0 z-[45] flex flex-col items-center px-4 pointer-events-none"
        :class="isSuperShortScreen ? 'balloon-stage-short' : 'balloon-stage'"
      >
        <div class="flex flex-col items-center w-full max-w-[500px] h-full min-h-0">

          <Lottie
            :src="balloonLottie"
            :loop="true"
            :speed="0.5"
            class="drop-shadow-2xl shrink-0"
            :class="isSuperShortScreen ? 'h-[12vh]' : 'h-[17vh]'"
          />

          <div class="w-full flex-1 min-h-0 flex items-center justify-center pb-24">
            <div
              v-if="balloonStore.receivedBalloon.img"
              class="relative p-1.5 rounded-[2.5rem] bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl max-w-full"
              :class="isSuperShortScreen ? 'max-h-[26vh]' : 'max-h-[36vh]'"
              :style="{ aspectRatio: imageAspectRatio }"
            >
              <img
                :src="balloonStore.receivedBalloon.img"
                alt="drawing"
                class="w-full h-full object-contain rounded-[2rem] bg-white/90"
              />

              <!-- SENDER INFO & MESSAGE (Frosted Glass Card, pinned to drawing) -->
              <Transition name="fade-up">
                <div
                  v-if="showDetails"
                  class="absolute left-1/2 top-full -translate-x-1/2 -mt-6 z-20 w-[280px] max-w-[85vw] flex flex-col items-center pointer-events-auto"
                >
                  <!-- Avatar Overlap -->
                  <img
                    :src="balloonStore.senderInfo?.img"
                    class="w-12 h-12 rounded-full border-2 border-white/80 shadow-xl bg-white object-cover z-30"
                  />

                  <!-- Info Bubble -->
                  <div
                    class="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2rem] shadow-2xl w-full -mt-6 pt-7">
                    <div
                      class="min-h-12 overflow-y-auto overflow-x-hidden px-5 py-4 text-center wrap-break-word"
                      :class="isSuperShortScreen ? 'max-h-20' : 'max-h-28'"
                    >
                      <!-- If they left a message -->
                      <template v-if="balloonStore.receivedBalloon.message">
                        <span
                          class="cabin-sketch-regular font-bold text-white drop-shadow-md"
                          :class="isSuperShortScreen ? 'text-sm' : 'text-base sm:text-lg'"
                        >
                          "{{ safeText(balloonStore.receivedBalloon.message, balloonStore.receivedBalloon.message_filtered) }}"
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
            <ion-button
              @click="disableConfirmationOpen = true"
              shape="round"
              color="light"
              fill="clear"
            >
              <ion-icon slot="start" :icon="svg(mdiBellOffOutline)"></ion-icon>
              Turn Off
            </ion-button>

            <!-- Report -->
            <ion-button
              @click="reportBalloon"
              shape="round"
              color="danger"
              fill="clear"
            >
              <ion-icon slot="start" :icon="svg(mdiFlagVariantOutline)"></ion-icon>
              Report
            </ion-button>
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
            <ion-button
              @click="balloonStore.refuseReceived"
              class="flex-1"
              size="large"
              shape="round"
              color="light"
              fill="outline"
            >
              Let it float
            </ion-button>

            <!-- Primary Action: Catch -->
            <ion-button
              @click="balloonStore.acceptReceived"
              class="flex-1"
              size="large"
              shape="round"
              color="secondary"
            >
              Catch It
            </ion-button>
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
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiBellOffOutline, mdiFlagVariantOutline } from "@mdi/js";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import balloonLottie from "@/assets/lottie/balloon.lottie";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import Lottie from "@/components/general/Lottie.vue";
import { svg } from "@/helper/general.helper";
import { safeText } from "@/helper/profanity.helper";
import { useBalloonStore } from "@/store/balloon.store";
import { useModerationStore } from "@/store/moderation.store";

const balloonStore = useBalloonStore();
const disableConfirmationOpen = ref(false);

const hasLanded = ref(false);
const showDetails = ref(false);
const showButtons = ref(false);
const isSuperShortScreen = ref(false);

// Natural width/height ratio, used only as a fallback when the balloon has no
// stored aspect_ratio (older records). Loaded off-screen, never blocks render.
const naturalRatio = ref<number | null>(null);

// Frame aspect ratio (width / height). Prefer the value stored on the balloon
// so the frosted frame hugs the drawing immediately, with no image round-trip.
const imageAspectRatio = computed(() => {
	const stored = balloonStore.receivedBalloon?.aspect_ratio;
	if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) {
		return String(stored);
	}
	if (naturalRatio.value) return String(naturalRatio.value);
	return "1";
});

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

// Fallback aspect-ratio probe (only relied on if the balloon lacks aspect_ratio)
function loadNaturalRatio(src: string) {
	const img = new Image();
	img.onload = () => {
		if (img.naturalWidth && img.naturalHeight) {
			naturalRatio.value = img.naturalWidth / img.naturalHeight;
		}
	};
	img.src = src;
}

watch(
	() => balloonStore.receivedBalloon,
	(val) => {
		naturalRatio.value = null;
		if (val?.img) loadNaturalRatio(val.img);
	},
	{ immediate: true },
);

// Animation Lifecycle
function handleLanded() {
	if (!balloonStore.receivedBalloon) return;
	hasLanded.value = true;

	const hasMessage =
		(balloonStore.receivedBalloon.message?.trim().length ?? 0) > 0;

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

/*
  Stage padding reserves room for the top header/controls and the bottom action
  dock, so the balloon art lives in the band between them and never collides
  with (or overflows past) the controls. Values include the device safe areas.
*/
.balloon-stage {
  padding-top: calc(env(safe-area-inset-top, 0px) + 8.5rem);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 6.5rem);
}

.balloon-stage-short {
  padding-top: calc(env(safe-area-inset-top, 0px) + 7.5rem);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 5.5rem);
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
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
</style>
