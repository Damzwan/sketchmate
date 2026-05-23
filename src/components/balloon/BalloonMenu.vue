<template>
  <ion-modal
    :is-open="balloonMenuOpen"
    @did-dismiss="close"
    @did-present="onPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-balloon-modal"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">

      <!-- Header -->
      <div class="shrink-0 pt-2 mb-4 text-center relative">
        <div class="absolute left-0 top-2">
          <button
            v-if="section !== 'home'"
            @click="section = 'home'"
            class="w-9 h-9 flex items-center justify-center bg-white/60 border border-primary/30 rounded-full active:scale-95"
          >
            <ion-icon :icon="svg(mdiChevronLeft)" class="w-6 h-6 text-black" />
          </button>
        </div>
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          {{ section === 'home' ? 'Balloons' : 'Your Balloons' }}
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          {{ sectionSubtitle }}
        </p>
      </div>

      <div
        class="flex-1 overflow-y-auto px-1 hide-scrollbar pb-4"
        style="min-height: 320px;"
        @touchmove.stop
      >
        <!-- HOME -->
        <template v-if="section === 'home'">
          <div class="flex flex-col items-center mb-5 mt-1">
            <div class="w-28 h-28 flex items-center justify-center">
              <Lottie :json="balloonLottie" :loop="true" :speed="0.5" class="w-28 h-28" />
            </div>
          </div>

          <div class="bg-white/60 border border-primary/30 rounded-3xl p-4 mb-4">
            <p class="text-[15px] font-bold text-black/80 leading-snug">
              A balloon carries your drawing to a random stranger.
              They can keep it, reply, or pass it on.
            </p>
            <p class="text-[13px] font-bold text-black/50 leading-snug mt-2">
              Slow, quiet ways to meet someone new.
            </p>
          </div>

          <div class="bg-white/80 border-2 rounded-3xl p-4 mb-4"
               :class="quotaStore.canSendBalloon ? 'border-secondary/40' : 'border-black/10'">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-black uppercase tracking-widest text-black/60">Today's Budget</span>
              <span v-if="!quotaStore.canSendBalloon" class="text-[10px] font-black uppercase bg-black/10 text-black/60 px-2 py-0.5 rounded">
                <template v-if="quotaStore.isPro">Resets in {{ resetCountdown }}</template>
                <template v-else>Limit Reached</template>
              </span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-4xl font-black text-secondary leading-none">{{ balloons.remaining }}</span>
              <span class="text-lg font-bold text-black/40 leading-none">/ {{ balloons.limit }}</span>
              <span class="text-sm font-bold text-black/60 ml-auto leading-none">
                {{ balloons.remaining === 1 ? 'balloon left' : 'balloons left' }}
              </span>
            </div>
          </div>

          <button
            v-if="myBalloons.length > 0"
            @click="section = 'manage'"
            class="w-full flex items-center gap-4 p-4 rounded-3xl bg-white/60 border border-primary/30 active:scale-[0.98] transition-transform mb-3"
          >
            <div class="w-11 h-11 rounded-2xl bg-amber-400/20 flex items-center justify-center text-xl shrink-0">📜</div>
            <div class="flex-1 text-left">
              <p class="font-black text-base text-black leading-none">Manage your balloons</p>
              <p class="text-[12px] font-bold text-black/50 mt-1 leading-none">
                {{ myBalloons.length }} in flight — cancel or check status
              </p>
            </div>
            <ion-icon :icon="svg(mdiChevronRight)" class="w-6 h-6 text-black/40" />
          </button>
        </template>

        <!-- MANAGE -->
        <template v-else-if="section === 'manage'">
          <div v-if="isLoadingMine" class="flex justify-center py-10">
            <ion-spinner name="crescent" color="secondary" />
          </div>

          <div v-else-if="myBalloons.length === 0" class="text-center py-12">
            <p class="text-base font-bold text-black/40">No balloons in flight.</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="b in myBalloons"
              :key="b._id"
              class="flex items-center gap-3 p-3 rounded-2xl bg-white/70 border border-primary/30"
            >
              <img :src="b.thumbnail" class="w-14 h-14 rounded-xl object-cover bg-white shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-black text-black truncate leading-none">
                  {{ b.message?.trim() || 'No note attached' }}
                </p>
                <p class="text-[11px] font-bold text-black/50 mt-1 leading-none capitalize">
                  {{ b.status }} · {{ relativeTime(b.createdAt) }}
                </p>
              </div>
              <button
                @click="onCancel(b)"
                :disabled="cancellingId === b._id"
                class="shrink-0 text-[11px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-black/5 text-black/70 active:scale-95 disabled:opacity-40"
              >
                {{ cancellingId === b._id ? '…' : 'Cancel' }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <div class="pt-2 pb-2 shrink-0">
        <ion-button
          v-if="section === 'home'"
          expand="block"
          color="secondary"
          shape="round"
          class="h-16 font-black uppercase tracking-widest shadow-lg"
          :disabled="!quotaStore.canSendBalloon && quotaStore.isPro"
          @click="handlePrimaryAction"
        >
          <template v-if="quotaStore.canSendBalloon">Release a Balloon</template>
          <template v-else-if="quotaStore.isPro">Resets in {{ resetCountdown }}</template>
          <template v-else>⭐ Upgrade to PRO</template>
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-2 opacity-60"
          @click="close"
        >
          Close
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import {
	IonModal,
	IonButton,
	IonIcon,
	IonSpinner,
	useIonRouter,
} from "@ionic/vue";
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";

import balloonLottie from "@/assets/lottie/balloon.json";

import { useQuotaStore } from "@/store/quota.store";
import { useMenuStore } from "@/store/menu.store";
import { cancelBalloon, fetchMyBalloons } from "@/service/api/balloon.api";
import type { Balloon } from "@/types/server.types";
import { Menu } from "@/draw/types/draw.types";
import Lottie from "@/components/general/Lottie.vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { useRoute } from "vue-router";

const router = useIonRouter();

// Driven by the global menu store
const menuStore = useMenuStore();
const { balloonMenuOpen } = storeToRefs(menuStore);

type Section = "home" | "manage";
const section = ref<Section>("home");

const quotaStore = useQuotaStore();
const { balloons } = storeToRefs(quotaStore);

const myBalloons = ref<Balloon[]>([]);
const isLoadingMine = ref(false);
const cancellingId = ref<string | null>(null);

// Countdown ticker
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
		? "Slow ways to meet someone new"
		: "In flight — tap cancel to recall",
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

const route = useRoute();
function onCreateNew() {
	close();
	if (route.path === `/${FRONTEND_ROUTES.draw}`) return;
	router.push(
		{
			path: FRONTEND_ROUTES.draw,
			query: { type: "balloon" },
		},
		masterAnimation,
	);
}

function handlePrimaryAction() {
	if (quotaStore.canSendBalloon) {
		onCreateNew();
	} else if (!quotaStore.isPro) {
		close();
		// router.push({ path: FRONTEND_ROUTES.subscribe });
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
	// Relying on naive initial load as requested
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

ion-modal.liquid-balloon-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 90vh;
  --background: var(--ion-color-tertiary);
}
ion-modal.liquid-balloon-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
.overflow-y-auto {
  mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
}
</style>