<template>
  <ion-page>
    <TopBar title="Home" />

    <ion-content class="--background-custom">
      <div class="px-4 pt-4 space-y-6 json-layout-wrapper pb-10">

        <GuestWarningBanner />

        <AgeGatedBanner />

        <HomeQuickActions
          :is-under-age="isUnderAge"
          @action="handleQuickAction"
        />

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
        <CommunityFeed
          v-if="!isUnderAge && communityFeedMounted"
          ref="communityFeed"
        />

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
	IonContent,
	IonPage,
	onIonViewDidEnter,
	onIonViewDidLeave,
	onIonViewWillEnter,
	useIonRouter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
// Vector Assets & Lottie Files
import draw_alone from "@/assets/illustrations/home/draw_alone.webp";
import draw_together from "@/assets/illustrations/home/draw_together.webp";
import share from "@/assets/illustrations/home/share.webp";
import balloonLottie from "@/assets/lottie/balloon.lottie";
import Lottie from "@/components/general/Lottie.vue";
import AgeGatedBanner from "@/components/home/AgeGatedBanner.vue";
import CommunityFeed from "@/components/home/CommunityFeed.vue";
import GuestWarningBanner from "@/components/home/GuestWarningBanner.vue";
import HomeQuickActions from "@/components/home/HomeQuickActions.vue";
import MyDrafts from "@/components/home/MyDrafts.vue";
import {
	type DrawingDraftMetadata,
	useDocumentStore,
} from "@/draw/document/document.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { masterAnimation } from "@/helper/animation.helper";
import { whenIdle } from "@/helper/general.helper";
import {
	refreshPublicLobbies,
	startWatchingLobbies,
} from "@/service/api/socket/drawSyncing.socket";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import TopBar from "../components/general/TopBar.vue";
import ActiveLobbies from "../components/home/ActiveLobbies.vue";

const r = useIonRouter();

const drawSyncerStore = useDrawSyncer();
const { publicLobbies } = storeToRefs(drawSyncerStore);
const { openMenu } = useMenuStore();
const { isUnderAge } = storeToRefs(useAuthStore());

const documentStore = useDocumentStore();
const { pendingDraftsList, removedDraftIds } = storeToRefs(documentStore);

const localDrafts = ref<DrawingDraftMetadata[]>([]);
const isLoadingDrafts = ref(true);
const communityFeed = ref<{ reloadIfDirty: () => void } | null>(null);
const communityFeedMounted = ref(true);
const constrainedDevice =
	typeof document !== "undefined" &&
	(document.documentElement.classList.contains("low-end") ||
		document.documentElement.classList.contains("android-wv"));
const FEED_RELEASE_DELAY_MS = constrainedDevice ? 0 : 15_000;
let feedReleaseTimer: ReturnType<typeof setTimeout> | null = null;

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

const mergedDrafts = computed<DrawingDraftMetadata[]>(() => {
	const pendingIds = pendingDraftIds.value;
	const removed = removedDraftIds.value;
	const real = localDrafts.value.filter(
		(d) => !pendingIds.has(d.id) && !removed.has(d.id),
	);
	const pending = pendingDraftsList.value.filter((p) => !removed.has(p.id));
	return [...pending, ...real].sort((a, b) => b.updatedAt - a.updatedAt);
});

onMounted(() => {
	whenIdle(() => {
		import("@/views/draw.view.vue").catch(() => {});
	}, 1500);
});

onIonViewDidEnter(() => {
	fetchDrafts();

	// Re-pull the community feed if the feed-level preference changed while we
	// were away (e.g. flipped off→open in Settings). CommunityFeed owns the feed
	// state; the child's own view hook doesn't fire, so drive it from here.
	communityFeed.value?.reloadIfDirty();

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

onIonViewWillEnter(() => {
	if (feedReleaseTimer) {
		clearTimeout(feedReleaseTimer);
		feedReleaseTimer = null;
	}
	communityFeedMounted.value = true;
});

onIonViewDidLeave(() => {
	if (feedReleaseTimer) clearTimeout(feedReleaseTimer);
	feedReleaseTimer = setTimeout(() => {
		// Pinia keeps the capped post data. Only the expensive card DOM, decoded
		// images, canvases and observers are released while another page runs.
		communityFeedMounted.value = false;
		feedReleaseTimer = null;
	}, FEED_RELEASE_DELAY_MS);
});

onBeforeUnmount(() => {
	if (feedReleaseTimer) clearTimeout(feedReleaseTimer);
});

watch(
	() => pendingDraftsList.value.length,
	(newLength, oldLength) => {
		if (newLength < oldLength) fetchDraftsBackground();
	},
);

const fetchDraftsBackground = async () => {
	try {
		localDrafts.value = await documentStore.getAllDraftMetadata();
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
	trackEvent(mixpanelEvents.lobbyOpen, { lobby_id: lobbyId, source: "home" });
	r.push(`${FRONTEND_ROUTES.draw}?room_id=${lobbyId}`, masterAnimation);
};

const fetchDrafts = async () => {
	isLoadingDrafts.value = true;
	try {
		localDrafts.value = await documentStore.getAllDraftMetadata();
	} finally {
		isLoadingDrafts.value = false;
	}
};

const handleDeleteDraft = async (id: string) => {
	try {
		await documentStore.removeDraft(id);
		localDrafts.value = localDrafts.value.filter((d) => d.id !== id);
	} catch (error) {
		console.error("[home] delete failed:", error);
	}
};

const openDraft = (id: string) => {
	trackEvent(mixpanelEvents.draftOpen, { draft_id: id });
	r.push(`${FRONTEND_ROUTES.draw}?id=${id}`, masterAnimation);
};
</script>

<style scoped>
.--background-custom {
  --background: var(--ion-color-background) !important;
}
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
