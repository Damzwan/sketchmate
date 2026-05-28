<template>
  <ion-page>
    <TopBar title="Home" />

    <ion-content class="--background-custom">
      <div class="px-4 pt-4 space-y-6 json-layout-wrapper pb-10">

        <!-- AGE-GATED BANNER (soft mode) -->
        <section
          v-if="isUnderAge"
          class="bg-amber-50/60 backdrop-blur-sm border border-amber-200/80 rounded-3xl p-4 flex gap-3 shadow-sm"
        >
          <span class="text-2xl shrink-0">🌱</span>
          <div class="flex-1 min-w-0">
            <p class="font-black text-sm text-amber-900 leading-tight">
              Public features unlock at 13
            </p>
            <p class="text-[12px] text-amber-800/90 mt-1 leading-snug">
              You can draw, save drafts, add mates, and draw together with them. Public lobbies, posts, and balloons will turn on when you're old enough.
            </p>
            <button
              @click="goToAgeSettings"
              class="text-[11px] font-bold text-amber-900 underline mt-2 block active:opacity-60"
            >
              Entered the wrong birthday? Fix it
            </button>
          </div>
        </section>

        <!-- COMPACT DYNAMIC BENTO GRID (WITH LOTTIE INTEGRATION) -->
        <section>
          <div class="grid grid-cols-6 gap-2.5 overflow-visible">
            <button
              v-for="action in visibleQuickActions"
              :key="action.id"
              @click="handleQuickAction(action.id)"
              class="relative overflow-visible flex flex-col justify-between p-3.5 rounded-[1.75rem] border transition-all duration-300 active:scale-[0.96] group text-left shadow-sm"
              :class="getCardLayoutClasses(action.id)"
            >
              <!-- Ambient Background Blur/Blob -->
              <div
                class="absolute -right-2 -bottom-2 w-16 h-16 rounded-full blur-md transition-transform duration-500 group-hover:scale-125 pointer-events-none"
                :class="action.id === 'draw_alone' || action.id === 'draw_together' ? 'bg-secondary/10' : 'bg-primary/20'"
              ></div>

              <!-- Visual Core Layer: Conditional Render between standard WebP images and Lottie -->
              <template v-if="action.id === 'balloon'">
                <div
                  class="absolute pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 z-20"
                  :class="getImageLayoutClasses(action.id)"
                >
                  <Lottie
                    :json="balloonLottie"
                    :loop="true"
                    :speed="0.5"
                    class="w-11/12 h-11/12"
                  />
                </div>
              </template>

              <template v-else>
                <img
                  :src="action.img"
                  class="absolute pointer-events-none object-contain transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 z-20"
                  :class="getImageLayoutClasses(action.id)"
                  alt=""
                />
              </template>

              <!-- Text Layout -->
              <div class="relative z-10 flex flex-col justify-between h-full items-start pointer-events-none">
                <span
                  class="cabin-sketch-regular leading-none text-black font-black tracking-tight"
                  :class="action.id === 'draw_alone' || action.id === 'draw_together' ? 'text-xl' : 'text-base'"
                >
                  {{ action.label }}
                </span>

                <!-- Tiny micro-pills to distinguish the styles without ruining symmetry -->
                <span
                  v-if="action.id === 'draw_alone'"
                  class="text-[8px] uppercase font-black tracking-widest px-2 py-0.5 bg-secondary text-white rounded-full shadow-sm mt-auto"
                >
                  Solo
                </span>
                <span
                  v-if="action.id === 'draw_together'"
                  class="text-[8px] uppercase font-black tracking-widest px-2 py-0.5 bg-secondary text-white rounded-full shadow-sm mt-auto"
                >
                  Live Lobbies
                </span>
              </div>
            </button>
          </div>
        </section>

        <!-- PUBLIC LOBBIES -->
        <ActiveLobbies
          v-if="!isUnderAge"
          :lobbies="publicLobbies"
          @join="joinLobby"
          :loading="publicLobbies.length === 0"
        />

        <!-- DRAFTS -->
        <MyDrafts
          :drafts="mergedDrafts"
          :loading="isLoadingDrafts"
          :pending-ids="pendingDraftIds"
          @open="openDraft"
          @delete="handleDeleteDraft"
        />

        <!-- COMMUNITY FEED -->
        <CommunityFeed v-if="!isUnderAge" />

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
	IonContent,
	IonPage,
	onIonViewDidEnter,
	useIonRouter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import TopBar from "../components/general/TopBar.vue";
import ActiveLobbies from "../components/home/ActiveLobbies.vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import {
	refreshPublicLobbies,
	startWatchingLobbies,
} from "@/service/api/socket/drawSyncing.socket";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import MyDrafts from "@/components/home/MyDrafts.vue";
import { DrawingDraft, useDrawLoadStore } from "@/draw/store/drawLoad.store";
import CommunityFeed from "@/components/home/CommunityFeed.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { useAuthStore } from "@/store/auth.store";
import Lottie from "@/components/general/Lottie.vue";

// Vector Assets & Lottie Files
import draw_alone from "@/assets/illustrations/home/draw_alone.webp";
import draw_together from "@/assets/illustrations/home/draw_together.webp";
import share from "@/assets/illustrations/home/share.webp";
import balloonLottie from "@/assets/lottie/balloon.json";
import { whenIdle } from "@/helper/general.helper";

const r = useIonRouter();

const drawSyncerStore = useDrawSyncer();
const { publicLobbies } = storeToRefs(drawSyncerStore);
const { openMenu } = useMenuStore();
const { isUnderAge } = storeToRefs(useAuthStore());

const loadStore = useDrawLoadStore();
const { pendingDraftsList } = storeToRefs(loadStore);

const localDrafts = ref<DrawingDraft[]>([]);
const isLoadingDrafts = ref(true);

const ALL_QUICK_ACTIONS = [
	{ id: "draw_alone", label: "Draw", img: draw_alone, requiresAge: false },
	{
		id: "draw_together",
		label: "Together",
		img: draw_together,
		requiresAge: false,
	},
	{ id: "share", label: "Add Mate", img: share, requiresAge: false },
	{ id: "balloon", label: "Balloon", img: null, requiresAge: true }, // img null because it switches to lottie
];

const visibleQuickActions = computed(() =>
	ALL_QUICK_ACTIONS.filter((a) => !a.requiresAge || !isUnderAge.value),
);

const getCardLayoutClasses = (id: string) => {
	switch (id) {
		case "draw_alone":
			return "col-span-3 h-24 border-primary/40 bg-gradient-to-br from-primary/20 to-tertiary";
		case "draw_together":
			return "col-span-3 h-24 border-primary/40 bg-gradient-to-br from-primary/20 to-tertiary";
		case "share":
			return "col-span-3 h-16 border-black/5 bg-tertiary";
		case "balloon":
			return "col-span-3 h-16 border-black/5 bg-tertiary";
		default:
			return "col-span-3";
	}
};

const getImageLayoutClasses = (id: string) => {
	switch (id) {
		case "draw_alone":
			return "w-18 h-18 -right-1 -bottom-1 drop-shadow-sm";
		case "draw_together":
			return "w-18 h-18 right-1 -bottom-1 drop-shadow-sm";
		case "share":
			return "w-14 h-14 right-2 bottom-1";
		case "balloon":
			return "w-14 h-14 right-2 bottom-0.5";
		default:
			return "w-12 h-12 right-0 bottom-0";
	}
};

const pendingDraftIds = computed(
	() => new Set(pendingDraftsList.value.map((p) => p.id)),
);

const mergedDrafts = computed<DrawingDraft[]>(() => {
	const pendingIds = pendingDraftIds.value;
	const real = localDrafts.value.filter((d) => !pendingIds.has(d.id));
	return [...pendingDraftsList.value, ...real].sort(
		(a, b) => b.updatedAt - a.updatedAt,
	);
});

onMounted(() => {
	whenIdle(() => {
		import("@/views/draw.view.vue").catch(() => {});
	}, 1500);
});

onIonViewDidEnter(() => {
	fetchDrafts();

	if (!isUnderAge.value) {
		useAuthStore()
			.waitUntilInitialized()
			.then(() => {
				refreshPublicLobbies();
			});
		socketLoggedInPromise.then(() => {
			startWatchingLobbies();
		});
	}
});

watch(
	() => pendingDraftsList.value.length,
	(newLength, oldLength) => {
		if (newLength < oldLength) fetchDraftsBackground();
	},
);

const fetchDraftsBackground = async () => {
	try {
		localDrafts.value = await loadStore.getAllDrafts();
	} catch (error) {
		console.error("[home] background fetch failed:", error);
	}
};

const handleQuickAction = (actionId: string) => {
	if (actionId === "draw_alone") {
		r.push(FRONTEND_ROUTES.draw, masterAnimation);
	} else if (actionId === "draw_together") {
		r.push(
			{ path: FRONTEND_ROUTES.draw, query: { together: "true" } },
			masterAnimation,
		);
	} else if (actionId === "share") {
		openMenu(Menu.ConnectionMenu);
	} else if (actionId === "balloon") {
		openMenu(Menu.BalloonMenu);
	}
};

const joinLobby = (lobbyId: string) => {
	r.push(`${FRONTEND_ROUTES.draw}?room_id=${lobbyId}`, masterAnimation);
};

const fetchDrafts = async () => {
	isLoadingDrafts.value = true;
	try {
		localDrafts.value = await loadStore.getAllDrafts();
	} finally {
		isLoadingDrafts.value = false;
	}
};

const handleDeleteDraft = async (id: string) => {
	try {
		await loadStore.removeDraft(id);
		localDrafts.value = localDrafts.value.filter((d) => d.id !== id);
	} catch (error) {
		console.error("[home] delete failed:", error);
	}
};

const openDraft = (id: string) => {
	r.push(`${FRONTEND_ROUTES.draw}?id=${id}`, masterAnimation);
};

const goToAgeSettings = () => {
	r.push(FRONTEND_ROUTES.settings, masterAnimation);
};
</script>

<style scoped>
.--background-custom {
  --background: var(--ion-color-background) !important;
}
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>