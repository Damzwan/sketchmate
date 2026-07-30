<template>
  <div class="relative w-full h-full overflow-hidden" :style="{ backgroundColor }">

    <div
      class="absolute inset-0 z-0 flex transition-opacity duration-300"
      :class="{ 'pointer-events-none opacity-50': disconnectedRoomId || isLoadingCanvas }"
    >
      <canvas
        ref="myCanvasRef"
        class="w-full h-full touch-none"
        id="mainCanvas"
      />

      <MultiplayerAvatars v-if="roomId" />

      <ClaimAreaOverlay v-if="roomId" />
    </div>

    <Toolbars :draw-mode="currentMode" />

    <DrawStatusIndicator />

    <DrawMenus />

    <DrawPerformancePanel v-if="showPerformancePanel" />

    <DrawExitGuard
      :draft-id="draftId"
      :is-lobby="isLobby"
    />
  </div>
</template>

<script setup lang="ts">
import {
	computed,
	defineAsyncComponent,
	onMounted,
	ref,
	onUnmounted,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { v4 as uuidv4 } from "uuid";

// Stores
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useSessionStore } from "@/store/session.store";
import { useMenuStore } from "@/store/menu.store";
import { useShareService } from "@/draw/sharing/shareService.store";

// Components
import Toolbars from "@/components/draw/toolbar/Toolbars.vue";
import MultiplayerAvatars from "@/components/draw/MultiplayerAvatars.vue";
import ClaimAreaOverlay from "@/components/draw/ClaimAreaOverlay.vue";
import DrawMenus from "@/components/draw/menus/DrawMenus.vue";
import DrawStatusIndicator from "@/components/draw/DrawStatusIndicator.vue";
import DrawExitGuard from "@/components/draw/DrawExitGuard.vue";

// Services & Sockets
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import { Menu } from "@/types/menu.types";

const route = useRoute();
const router = useRouter();

const myCanvasRef = ref<HTMLCanvasElement>();

const drawStore = useDrawStore();
const { initCanvas } = drawStore;
const { backgroundColor } = storeToRefs(drawStore);

const drawSyncer = useDrawSyncer();
const { disconnectedRoomId, isLoadingCanvas, roomId } = storeToRefs(drawSyncer);

// ─── 1. CLEAN PARAMETER RESOLUTION ──────────────────────────────
const sessionStore = useSessionStore();
const shareService = useShareService();

const getParam = (key: string): string | undefined => {
	const val = route.query[key] || sessionStore.queryParams?.get(key);
	return val ? String(val) : undefined;
};

const currentMode = computed(() => getParam("mode") || "solo");
const isLobby = computed(() => !!getParam("room_id"));
const drawTogether = computed(() => !!getParam("together"));
const type = computed(() => getParam("type"));
const targetRoomId = computed(() => getParam("room_id"));
const canvasUrl = computed(() => getParam("canvas_url"));
const showPerformancePanel = computed(
	() => import.meta.env.DEV && route.query.perf === "1",
);
const DrawPerformancePanel = import.meta.env.DEV
	? defineAsyncComponent(
			() =>
				import("@/components/draw/benchmark/DrawPerformancePanel.vue"),
		)
	: undefined;

const draftId = ref(getParam("id"));

// ─── 2. LIFECYCLE & ROUTE SANITIZATION ─────────────────────────
onMounted(() => {
	const newQuery = { ...route.query };
	let routeNeedsUpdate = false;

	// Ensure Draft ID
	if (!isLobby.value && !draftId.value) {
		draftId.value = uuidv4();
		newQuery.id = draftId.value;
		routeNeedsUpdate = true;
	}

	// Consume and clear 'type' parameter
	if (type.value === "balloon") {
		shareService.preSelected = "balloon";
		delete newQuery.type;
		routeNeedsUpdate = true;

		if (sessionStore.queryParams?.has("type")) {
			sessionStore.queryParams.delete("type");
		}
	} else {
		shareService.preSelected = "mate";
	}

	// Perform one clean route replacement without timeouts
	if (routeNeedsUpdate) {
		router.replace({ query: newQuery });
	}

	// ─── 3. CANVAS BOOTSTRAPPING ──────────────────────────────────
	requestAnimationFrame(() => {
		if (!myCanvasRef.value) return;

		initCanvas(myCanvasRef.value, {
			isLobby: isLobby.value || drawTogether.value,
			draftId: draftId.value,
			canvasUrl: canvasUrl.value,
		}).then(async () => {
			if (drawTogether.value) {
				canvasReady.value = true;
				maybeOpenRoomMenu();
			} else {
				await socketLoggedInPromise;

				if (targetRoomId.value) {
					socketJoinRoom({ roomId: targetRoomId.value, intent: "join" });
				}
			}
		});
	});
});

// The DrawRoomMenu sheet is heavy; opening it *during* the page-push animation
// (and the canvas boot) stutters. Present it once, a beat after the canvas is
// ready, so the push transition has settled first.
const canvasReady = ref(false);
let roomMenuOpened = false;

function maybeOpenRoomMenu() {
	if (roomMenuOpened || !drawTogether.value || !canvasReady.value) return;
	roomMenuOpened = true;
	const { openMenu } = useMenuStore();
	setTimeout(() => openMenu(Menu.DrawRoomMenu), 350);
}

onUnmounted(() => {});
</script>

<style scoped>
#mainCanvas {
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
</style>
