<template>
  <BaseSheetModal
    :is-open="balloonMenuOpen"
    :title="section === 'home' ? 'Balloons' : 'In Flight'"
    :subtitle="sectionSubtitle"
    :show-back="section !== 'home'"
    @close="close"
    @back="section = 'home'"
    @present="onPresent"
  >
    <template v-if="section === 'home'">
      <div class="relative w-full h-40 flex items-center justify-between px-2 mb-3 mt-1">
        <div class="flex flex-col items-center z-10 w-20">
          <div
            class="w-14 h-14 rounded-full border-2 border-primary/20 bg-black/5 overflow-hidden flex items-center justify-center">
            <img v-if="user?.img" :src="user.img" class="w-full h-full object-cover" alt="You" />
            <ion-icon v-else :icon="svg(mdiAccount)" class="text-3xl text-primary/40" />
          </div>
          <span class="text-[11px] uppercase tracking-widest mt-2 opacity-70">You</span>
        </div>

        <div class="absolute inset-x-16 top-[35%] border-t-2 border-dashed border-primary/20 -z-10"></div>

        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div class="animate-fly-direct flex flex-col items-center">
            <Lottie :src="balloonLottie" :loop="true" :speed="0.8" class="h-24 drop-shadow-md" />
            <div class="w-10 h-12 bg-white border-2 border-primary/30 rounded-md overflow-hidden animate-swing">
              <img :src="drawingImg" class="w-full h-full object-cover opacity-95" />
            </div>
          </div>
        </div>

        <div class="flex flex-col items-center z-10 w-20 relative">
          <div
            class="w-14 h-14 rounded-full border-2 border-secondary/20 bg-white flex items-center justify-center relative">
            <ion-icon :icon="svg(mdiHelp)" class="text-3xl text-secondary/40" />
            <div class="absolute -top-3 -right-3 text-3xl drop-shadow-sm animate-mate-heart text-secondary">
              <ion-icon :icon="svg(mdiHeart)" />
            </div>
          </div>
          <span class="text-[11px] uppercase tracking-widest mt-2 opacity-70">Stranger</span>
        </div>
      </div>

      <div class="text-center px-4 mb-6 mt-1">
        <p class="text-2xl cabin-sketch-regular font-black  leading-snug">
          Release a balloon up in the air!
        </p>
        <p class="cabin-sketch-regular text-black/80 leading-snug px-2">
          If a stranger catches your sketch and replies, you become mates.
        </p>
      </div>

      <div class="bg-white/80 border border-primary/20 rounded-2xl p-5 mb-4 flex flex-col gap-3"
           :class="!quotaStore.canSendBalloon && 'opacity-70'"
      >
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-lg uppercase tracking-widest text-black/80">Daily Balloons</span>
            <span v-if="!quotaStore.canSendBalloon" class="text-base font-bold text-secondary mt-1">
        <template v-if="quotaStore.isPro">Resets in {{ resetCountdown }}</template>
        <template v-else>Limit Reached</template>
      </span>
          </div>
          <div class="flex items-baseline gap-1">
            <span class="text-3xl font-black text-secondary leading-none">{{ balloons.remaining }}</span>
            <span class="text-lg text-black/60 leading-none">/ {{ balloons.limit }}</span>
          </div>
        </div>

        <!-- The "Why" explanation -->
        <div class="border-t border-black/5 pt-2">
          <p class="text-sm text-black/80 leading-relaxed">
            We limit daily balloons so every connection is thoughtful, slow, and genuine.
          </p>
        </div>
      </div>

      <button
        v-if="myBalloons.length > 0"
        @click="section = 'manage'"
        class="w-full flex items-center gap-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-500/20 active:scale-[0.98] transition-all mb-2"
      >
        <div
          class="w-12 h-12 rounded-xl bg-amber-400/20 flex items-center justify-center text-2xl shrink-0 text-amber-600">
          <ion-icon :icon="svg(mdiHistory)" />
        </div>
        <div class="flex-1 text-left">
          <p class="font-black text-base text-black leading-none">Track Balloons</p>
          <p class="text-[11px] uppercase tracking-widest text-black/60 mt-1.5 leading-none">
            {{ myBalloons.length }} in flight
          </p>
        </div>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-2xl text-black/30" />
      </button>
    </template>

    <template v-else-if="section === 'manage'">
      <div v-if="isLoadingMine" class="flex justify-center py-12">
        <ion-spinner name="crescent" color="secondary" />
      </div>

      <div v-else-if="myBalloons.length === 0" class="text-center py-16">
        <div class="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
          <ion-icon :icon="svg(mdiHelp)" class="text-3xl text-black/20" />
        </div>
        <p class="text-sm text-black/60 uppercase tracking-widest">Nothing in flight</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="b in myBalloons"
          :key="b._id"
          class="flex items-center gap-3 p-3 rounded-2xl bg-white/70 border border-primary/20"
        >
          <img :src="b.thumbnail" class="w-14 h-14 rounded-xl object-cover bg-black/5 shrink-0" />
          <div class="flex-1 min-w-0 pr-2">
            <p class="text-sm font-black text-black truncate leading-none">
              {{ b.message?.trim() || 'No note attached' }}
            </p>
            <p class="text-[10px] uppercase tracking-widest text-black/60 mt-1.5 leading-none">
              {{ b.status }} · {{ relativeTime(b.createdAt) }}
            </p>
          </div>
          <ion-button
            fill="clear"
            color="danger"
            :disabled="cancellingId === b._id"
            class="m-0 h-10 font-black tracking-widest text-[10px] uppercase bg-red-500/10 rounded-full shrink-0"
            @click="onCancel(b)"
          >
            {{ cancellingId === b._id ? '...' : 'Recall' }}
          </ion-button>
        </div>
      </div>
    </template>

    <template #footer>
      <ion-button
        v-if="section === 'home'"
        expand="block"
        color="secondary"
        size="large"
        shape="round"
        :disabled="!quotaStore.canSendBalloon && quotaStore.isPro"
        @click="handlePrimaryAction"
      >
        <template v-if="quotaStore.canSendBalloon">Release a Balloon</template>
        <template v-else-if="quotaStore.isPro">Resets in {{ resetCountdown }}</template>
        <template v-else>
          <ion-icon :icon="svg(mdiStar)" class="mr-1" />
          Upgrade to PRO
        </template>
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { IonButton, IonIcon, IonSpinner, useIonRouter } from "@ionic/vue";
import {
	mdiChevronRight,
	mdiAccount,
	mdiHelp,
	mdiHeart,
	mdiHistory,
	mdiStar,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useRoute } from "vue-router";

import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import balloonLottie from "@/assets/lottie/balloon.lottie";
import Lottie from "@/components/general/Lottie.vue";
import drawingImg from "@/assets/login_images/1.webp";

import { useAuthStore } from "@/store/auth.store";
import { useQuotaStore } from "@/store/quota.store";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { cancelBalloon, fetchMyBalloons } from "@/service/api/balloon.api";
import type { Balloon } from "@/types/server.types";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

const router = useIonRouter();
const route = useRoute();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const menuStore = useMenuStore();
const { balloonMenuOpen } = storeToRefs(menuStore);

type Section = "home" | "manage";
const section = ref<Section>("home");

const quotaStore = useQuotaStore();
const { balloons } = storeToRefs(quotaStore);

const myBalloons = ref<Balloon[]>([]);
const isLoadingMine = ref(false);
const cancellingId = ref<string | null>(null);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

function startTicker() {
	if (timer) return;
	timer = setInterval(() => {
		now.value = Date.now();
	}, 1000);
}

function stopTicker() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

onUnmounted(stopTicker);

const resetCountdown = computed(() => {
	const resetMs = new Date(balloons.value.reset_at).getTime();
	const diff = Math.max(0, resetMs - now.value);
	const h = Math.floor(diff / 3_600_000);
	const m = Math.floor((diff % 3_600_000) / 60_000);
	if (h > 0) return `${h}h ${m}m`;
	const s = Math.floor((diff % 60_000) / 1_000);
	return `${m}m ${s}s`;
});

const sectionSubtitle = computed(() =>
	section.value === "home"
		? "Find a mate across the skies"
		: "Recall balloons before they are caught",
);

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.floor(diff / 60_000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

async function loadMyBalloons() {
	isLoadingMine.value = true;
	try {
		const { balloons } = await fetchMyBalloons();
		myBalloons.value = balloons;
	} catch (e) {
		console.error("Failed to load balloons:", e);
	} finally {
		isLoadingMine.value = false;
	}
}

async function onCancel(b: Balloon) {
	if (cancellingId.value) return;
	cancellingId.value = b._id;
	try {
		await cancelBalloon(b._id);
		quotaStore.incrementBalloon();
		myBalloons.value = myBalloons.value.filter((x) => x._id !== b._id);
	} catch (e) {
		console.error("Failed to cancel balloon:", e);
	} finally {
		cancellingId.value = null;
	}
}

function onCreateNew() {
	close();
	if (route.path === `/${FRONTEND_ROUTES.draw}`) return;
	router.push(
		{ path: FRONTEND_ROUTES.draw, query: { type: "balloon" } },
		masterAnimation,
	);
}

function handlePrimaryAction() {
	if (quotaStore.canSendBalloon) {
		onCreateNew();
	} else if (!quotaStore.isPro) {
		// Out of balloons on the free tier — same as everywhere else: open the paywall.
		useSubscriptionStore().openPaywall();
	}
}

function close() {
	stopTicker();
	menuStore.closeMenu(Menu.BalloonMenu);
}

function onPresent() {
	startTicker();
	section.value = "home";
	void loadMyBalloons();
}
</script>

<style scoped>
/* Wide Direct Balloon Flight Path Animation Rules */
.animate-fly-direct {
  animation: flyDirect 5.5s ease-in-out infinite;
}

@keyframes flyDirect {
  0% {
    transform: translateX(-110px) translateY(15px) scale(0.85);
    opacity: 0;
  }
  12% {
    opacity: 1;
    transform: translateX(-110px) translateY(15px) scale(0.95);
  }
  45% {
    transform: translateX(110px) translateY(-5px) scale(1.05);
    opacity: 1;
  }
  75% {
    transform: translateX(110px) translateY(-5px) scale(1.05);
    opacity: 1;
  }
  88% {
    opacity: 0;
    transform: translateX(110px) translateY(-20px) scale(0.95);
  }
  100% {
    transform: translateX(-110px) translateY(15px) scale(0.85);
    opacity: 0;
  }
}

/* Canvas Swing Animation Rules */
.animate-swing {
  transform-origin: top center;
  animation: swingPaper 2.5s ease-in-out infinite alternate;
}

@keyframes swingPaper {
  0% {
    transform: rotate(-12deg);
  }
  100% {
    transform: rotate(12deg);
  }
}

/* Friendship Heart Pop Animation Rules */
.animate-mate-heart {
  animation: heartPop 5.5s ease-in-out infinite;
}

@keyframes heartPop {
  0%, 40% {
    opacity: 0;
    transform: scale(0.4);
  }
  46% {
    opacity: 1;
    transform: scale(1.4);
  }
  52%, 75% {
    opacity: 1;
    transform: scale(1);
  }
  82%, 100% {
    opacity: 0;
    transform: scale(0.4);
  }
}
</style>
