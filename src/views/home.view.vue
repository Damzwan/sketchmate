<template>
  <ion-page>
    <TopBar title="Home" />

    <ion-content class="bg-background">
      <div class="px-4 pt-2 space-y-6">

        <!-- AGE-GATED BANNER (soft mode) -->
        <section
          v-if="isUnderAge"
          class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3"
        >
          <span class="text-2xl shrink-0">🌱</span>
          <div class="flex-1 min-w-0">
            <p class="font-black text-sm text-amber-900 leading-tight">
              Public features unlock at 13
            </p>
            <p class="text-[12px] text-amber-800/80 mt-1 leading-snug">
              You can draw, save drafts, add mates, and draw together with them. Public lobbies, posts, and balloons will turn on when you're old enough.
            </p>
            <button
              @click="goToAgeSettings"
              class="text-[11px] font-bold text-amber-900 underline mt-2"
            >
              Entered the wrong birthday? Fix it
            </button>
          </div>
        </section>

        <!-- QUICK ACTIONS (filtered by age) -->
        <section>
          <p class="text-base font-black text-black mb-3 px-1">Quick Actions</p>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="action in visibleQuickActions"
              :key="action.id"
              class="flex items-center p-3 bg-primary/40 rounded-2xl border border-primary/60 active:scale-95 transition-all"
              @click="handleQuickAction(action.id)"
            >
              <div
                class="flex-shrink-0 w-9 h-9 bg-primary rounded-xl flex items-center justify-center mr-3 shadow-sm border border-primary/20">
                <span class="text-lg">{{ action.iconFallback }}</span>
              </div>
              <span class="text-sm font-bold text-black truncate">{{ action.label }}</span>
            </button>
          </div>
        </section>

        <!-- PUBLIC LOBBIES — hidden for underage -->
        <ActiveLobbies
          v-if="!isUnderAge"
          :lobbies="publicLobbies"
          @join="joinLobby"
          :loading="publicLobbies.length === 0"
        />

        <!-- DRAFTS — always shown -->
        <MyDrafts
          :drafts="mergedDrafts"
          :loading="isLoadingDrafts"
          :pending-ids="pendingDraftIds"
          @open="openDraft"
          @delete="handleDeleteDraft"
        />

        <!-- COMMUNITY FEED — hidden for underage -->
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

const r = useIonRouter();

const drawSyncerStore = useDrawSyncer();
const { publicLobbies } = storeToRefs(drawSyncerStore);
const { openMenu } = useMenuStore();
const { isUnderAge } = storeToRefs(useAuthStore());

const loadStore = useDrawLoadStore();
const { pendingDraftsList } = storeToRefs(loadStore);

const localDrafts = ref<DrawingDraft[]>([]);
const isLoadingDrafts = ref(true);

// Only balloon is age-gated. Draw-together (private rooms with mates) and
// adding mates are allowed for underage users.
const ALL_QUICK_ACTIONS = [
	{ id: "draw_alone", label: "Draw", iconFallback: "✏️", requiresAge: false },
	{
		id: "draw_together",
		label: "Draw together",
		iconFallback: "👋",
		requiresAge: false,
	},
	{ id: "share", label: "Add a Mate", iconFallback: "🤝", requiresAge: false },
	{ id: "balloon", label: "Balloon", iconFallback: "🎈", requiresAge: true },
];

const visibleQuickActions = computed(() =>
	ALL_QUICK_ACTIONS.filter((a) => !a.requiresAge || !isUnderAge.value),
);

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

onMounted(async () => {
	try {
		await import("@/views/draw.view.vue");
	} catch (error) {}
});

onIonViewDidEnter(() => {
	fetchDrafts();

	// Skip lobby network calls for underage — they can't see public lobbies
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
		if (newLength < oldLength) {
			fetchDraftsBackground();
		}
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
	if (pendingDraftIds.value.has(id)) return;
	r.push(`${FRONTEND_ROUTES.draw}?id=${id}`, masterAnimation);
};

const goToAgeSettings = () => {
	r.push(FRONTEND_ROUTES.settings, masterAnimation);
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>