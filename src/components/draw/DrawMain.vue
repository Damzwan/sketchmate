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

    <Toolbars :draw-mode="currentMode" @start-benchmark="openPerformanceCapture" />

    <DrawStatusIndicator />

    <DrawMenus />

    <DrawPerformancePanel
      v-if="showPerformancePanel"
      :auto-start-signal="performanceAutoStartSignal"
      @close="closePerformancePanel"
    />

    <DrawExitGuard
	  :draft-id="draftId || ''"
      :is-lobby="isLobby"
    />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import {
	computed,
	defineAsyncComponent,
	onMounted,
	onUnmounted,
	ref,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import ClaimAreaOverlay from "@/components/draw/ClaimAreaOverlay.vue";
import DrawExitGuard from "@/components/draw/DrawExitGuard.vue";
import DrawStatusIndicator from "@/components/draw/DrawStatusIndicator.vue";
import MultiplayerAvatars from "@/components/draw/MultiplayerAvatars.vue";
import DrawMenus from "@/components/draw/menus/DrawMenus.vue";
// Components
import Toolbars from "@/components/draw/toolbar/Toolbars.vue";
// Stores
import { useDrawStore } from "@/draw/session/draw.store";
import { useShareService } from "@/draw/sharing/shareService.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
// Services & Sockets
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { useSessionStore } from "@/store/session.store";
import { Menu } from "@/types/menu.types";
import { uuidv4 } from "@/utils/uuid";

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
const performancePanelRequested = ref(false);
const performanceAutoStartSignal = ref(0);
const showPerformancePanel = computed(
	() => performancePanelRequested.value || route.query.perf === "1",
);
const DrawPerformancePanel = defineAsyncComponent(
	() => import("@/components/draw/benchmark/DrawPerformancePanel.vue"),
);

function openPerformanceCapture() {
	performancePanelRequested.value = true;
	performanceAutoStartSignal.value++;
}

function closePerformancePanel() {
	performancePanelRequested.value = false;
	if (route.query.perf !== "1") return;
	const query = { ...route.query };
	delete query.perf;
	delete query.bench;
	void router.replace({ query });
}

const draftId = ref(getParam("id"));
const { toast } = useToast();
let mounted = false;
let initFrame: number | null = null;
let roomMenuTimer: ReturnType<typeof setTimeout> | null = null;

// ─── 2. LIFECYCLE & ROUTE SANITIZATION ─────────────────────────
onMounted(() => {
	mounted = true;
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
	initFrame = requestAnimationFrame(() => {
		initFrame = null;
		if (!myCanvasRef.value) return;

		void (async () => {
			try {
				await initCanvas(myCanvasRef.value!, {
					isLobby: isLobby.value || drawTogether.value,
					draftId: draftId.value,
					canvasUrl: canvasUrl.value,
				});
				if (!mounted || !drawStore.isCanvasInitialized) return;
				if (drawTogether.value) {
					canvasReady.value = true;
					maybeOpenRoomMenu();
				} else {
					await socketLoggedInPromise;
					if (!mounted || !drawStore.isCanvasInitialized) return;

					if (targetRoomId.value) {
						socketJoinRoom({ roomId: targetRoomId.value, intent: "join" });
					}
				}
			} catch (error) {
				if (!mounted) return;
				console.error("[draw] canvas initialization failed", error);
				toast("Couldn't open this drawing. Please go back and try again.", {
					color: "danger",
				});
			}
		})();
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
	roomMenuTimer = setTimeout(() => {
		roomMenuTimer = null;
		if (mounted && drawStore.isCanvasInitialized) openMenu(Menu.DrawRoomMenu);
	}, 350);
}

onUnmounted(() => {
	mounted = false;
	if (initFrame !== null) cancelAnimationFrame(initFrame);
	if (roomMenuTimer) clearTimeout(roomMenuTimer);
	initFrame = null;
	roomMenuTimer = null;
	drawStore.disposeSession();
});
</script>

<style scoped>
#mainCanvas {
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
</style>
