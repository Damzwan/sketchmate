<script setup lang="ts">
import { onBeforeRouteLeave } from "vue-router";
import { modalController, useBackButton, useIonRouter } from "@ionic/vue";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import { onUnmounted, ref, watch } from "vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { slideTransition } from "@/helper/animation.helper";
import { useDrawUIStore } from "@/draw/store/drawUI.store";
import DrawExitModal from "@/components/draw/DrawExitModal.vue";

const props = defineProps<{
	draftId: string;
	isLobby: boolean;
}>();

const router = useIonRouter();
const loadStore = useDrawLoadStore();
const uiStore = useDrawUIStore();

// Set once we've decided to leave for real. Prevents the guard / back-button
// hooks from re-prompting on the actual navigation.
let isNavigationConfirmed = false;

// Reentrancy guard for the lobby modal.
const isModalOpen = ref(false);

// ─────────────────────────────────────────────────────────────────────────
// Public entry points (toolbar X, hardware back, route change, swipe-back)
// all funnel through here. We resolve true/false from `resolveExit` and
// only then commit to navigating.
// ─────────────────────────────────────────────────────────────────────────
const requestExit = async () => {
	if (isNavigationConfirmed) {
		commitExit();
		return;
	}
	const shouldLeave = await resolveExit();
	if (shouldLeave) commitExit();
};

watch(() => uiStore.exitRequested, requestExit);

const commitExit = () => {
	isNavigationConfirmed = true;
	loadStore.stopAutosave();

	// SOLO: snapshot and queue background save. Fire-and-forget — the snapshot
	// resolves in a handful of ms; we don't await the write. The Home page
	// sees the pending draft immediately via the store.
	if (!props.isLobby) {
		loadStore.exitWithBackgroundSave();
	}

	if (router.canGoBack()) {
		router.back();
	} else {
		router.replace(FRONTEND_ROUTES.home, slideTransition);
	}
};

// ─────────────────────────────────────────────────────────────────────────
// Decision logic.
//
//   SOLO   → always exit. Autosave has us covered; the user can delete from
//            the gallery if they don't want it.
//   LOBBY  → modal with Leave / Cancel. No discard option (you're not in
//            charge of the room's content anyway).
// ─────────────────────────────────────────────────────────────────────────
const resolveExit = async (): Promise<boolean> => {
	if (!props.isLobby) return true;
	if (isModalOpen.value) return false;

	isModalOpen.value = true;
	const modal = await modalController.create({
		component: DrawExitModal,
		cssClass: "draw-exit-modal",
		breakpoints: [0, 1],
		initialBreakpoint: 1,
	});
	await modal.present();
	const { role } = await modal.onWillDismiss();
	isModalOpen.value = false;

	return role === "leave";
};

// ─────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────
onBeforeRouteLeave(async (_to, _from, next) => {
	if (isNavigationConfirmed) return next();
	const shouldLeave = await resolveExit();
	if (shouldLeave) {
		isNavigationConfirmed = true;
		loadStore.stopAutosave();
		if (!props.isLobby) loadStore.exitWithBackgroundSave();
		next();
	} else {
		next(false);
	}
});

const backButtonSubscription = useBackButton(1, async (processNextHandler) => {
	if (isNavigationConfirmed) {
		processNextHandler();
		return;
	}
	await requestExit();
});

onUnmounted(() => {
	if (backButtonSubscription) backButtonSubscription.unregister();
});
</script>