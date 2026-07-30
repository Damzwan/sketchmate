<script setup lang="ts">
import { onBeforeRouteLeave } from "vue-router";
import { modalController, useBackButton, useIonRouter } from "@ionic/vue";
import { useDocumentStore } from "@/draw/document/document.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { onUnmounted, ref, watch } from "vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { slideTransition } from "@/helper/animation.helper";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import DrawExitModal from "@/components/draw/DrawExitModal.vue";
import { useSessionStore } from "@/store/session.store";

const props = defineProps<{
	draftId: string;
	isLobby: boolean;
}>();

const router = useIonRouter();
const documentStore = useDocumentStore();
const drawStore = useDrawStore();
const uiStore = useDrawUIStore();

let isNavigationConfirmed = false;
const isModalOpen = ref(false);

const requestExit = async () => {
	if (isNavigationConfirmed) {
		commitExit();
		return;
	}
	const shouldLeave = await resolveExit();
	if (shouldLeave) commitExit();
};

watch(() => uiStore.exitRequested, requestExit);

const commitExit = (goBack = true) => {
	isNavigationConfirmed = true;
	documentStore.stopAutosave();

	if (!props.isLobby) {
		const canvas = drawStore.getCanvas();
		const totalObjects = canvas ? canvas.getObjects().length : 0;
		const isPreExistingDraft = documentStore.isPreExistingDraft || false;

		// FIX: Drop empty drawings from cache tracking completely if they were previous records
		if (totalObjects === 0 && isPreExistingDraft) {
			documentStore.removeDraft(props.draftId);
		} else {
			documentStore.exitWithBackgroundSave();
		}
	}

	// FIX: Clear query parameters explicitly before popping back routing history
	const sessionStore = useSessionStore();
	sessionStore.setQueryParams(undefined);

	if (!goBack) return;
	if (router.canGoBack()) {
		router.back();
	} else {
		router.replace(FRONTEND_ROUTES.home, slideTransition);
	}
};

// ─────────────────────────────────────────────────────────────────────────
// Decision logic updated: Resolves modal warnings based on canvas content status
// ─────────────────────────────────────────────────────────────────────────
const resolveExit = async (): Promise<boolean> => {
	if (isModalOpen.value) return false;

	const canvas = drawStore.getCanvas();
	const totalObjects = canvas ? canvas.getObjects().length : 0;
	const isPreExistingDraft = documentStore.isPreExistingDraft || false;

	// Flag determining whether exit causes an implicit wipe out execution
	const isEmptyDeletion =
		!props.isLobby && totalObjects === 0 && isPreExistingDraft;

	isModalOpen.value = true;
	const modal = await modalController.create({
		component: DrawExitModal,
		cssClass: "draw-exit-modal",
		breakpoints: [0, 1],
		initialBreakpoint: 1,
		componentProps: {
			isLobby: props.isLobby,
			isEmptyDeletion: isEmptyDeletion, // Inform dialog about removal warning requirements
		},
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
	// If we already confirmed, just go
	if (isNavigationConfirmed) return next();

	// BYPASS: If we are coming from a successful share, skip the modal
	if (uiStore.isForceExiting) {
		uiStore.isForceExiting = false; // Reset it for the next session
		commitExit(false); // we are already calling the exit logic from our sendhub.vue
		return next();
	}

	// NORMAL CASE: Prompt the user with the modal
	const shouldLeave = await resolveExit();
	if (shouldLeave) {
		commitExit();
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
