<script setup lang="ts">
import { modalController, useBackButton, useIonRouter } from "@ionic/vue";
import * as Sentry from "@sentry/capacitor";
import { onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import DrawExitModal from "@/components/draw/DrawExitModal.vue";
import { useDocumentStore } from "@/draw/document/document.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { slideTransition } from "@/helper/animation.helper";
import { useToast } from "@/service/toast.service";
import { useSessionStore } from "@/store/session.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const props = defineProps<{
	draftId: string;
	isLobby: boolean;
}>();

const router = useIonRouter();
const documentStore = useDocumentStore();
const drawStore = useDrawStore();
const uiStore = useDrawUIStore();
const { toast } = useToast();

let isNavigationConfirmed = false;
let exitPromise: Promise<boolean> | null = null;
const isModalOpen = ref(false);

const requestExit = async () => {
	if (isNavigationConfirmed) {
		await commitExit();
		return;
	}
	const shouldLeave = await resolveExit();
	if (shouldLeave) await commitExit();
};

watch(() => uiStore.exitRequested, requestExit);

const commitExit = async (goBack = true): Promise<boolean> => {
	if (exitPromise) return exitPromise;
	isNavigationConfirmed = true;
	exitPromise = (async () => {
		try {
			// Abort a cold load and wait for an active eraser commit before taking
			// the detached save snapshot. The live Fabric canvas remains valid here.
			await drawStore.prepareForExit();
			documentStore.stopAutosave();

			if (!props.isLobby && drawStore.isCanvasInitialized) {
				const canvas = drawStore.getCanvas();
				const totalObjects = canvas ? canvas.getObjects().length : 0;
				const isPreExistingDraft = documentStore.isPreExistingDraft || false;

				if (totalObjects === 0 && isPreExistingDraft) {
					await documentStore.removeDraft(props.draftId);
				} else if (
					documentStore.isDirty ||
					(!isPreExistingDraft && !documentStore.lastSavedAt)
				) {
					// Resolves once immutable JSON is detached. Thumbnail rendering and the
					// IDB write can continue after disposeSession releases the live canvas.
					await documentStore.exitWithBackgroundSave();
				}
			}

			useSessionStore().setQueryParams(undefined);
			drawStore.disposeSession();

			if (goBack) {
				if (router.canGoBack()) router.back();
				else router.replace(FRONTEND_ROUTES.home, slideTransition);
			}
			return true;
		} catch (error) {
			console.error("[draw] exit preparation failed", error);
			// This exception is intentionally caught to keep the drawing open, so the
			// global unhandled-error integration cannot observe it automatically.
			Sentry.captureException(error, {
				tags: { subsystem: "drawing", operation: "session_exit" },
			});
			isNavigationConfirmed = false;
			// The drawing stays open when its final snapshot fails. Restore periodic
			// persistence so a transient IDB/storage error does not leave it unprotected.
			if (!props.isLobby && props.draftId && drawStore.isCanvasInitialized) {
				documentStore.startAutosave(drawStore.getCanvas(), props.draftId);
			}
			toast("Couldn't safely save this drawing. Please try again.", {
				color: "danger",
			});
			return false;
		} finally {
			exitPromise = null;
		}
	})();
	return exitPromise;
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
		const exited = await commitExit(false);
		if (exited) next();
		else next(false);
		return;
	}

	// NORMAL CASE: Prompt the user with the modal
	const shouldLeave = await resolveExit();
	if (shouldLeave) {
		const exited = await commitExit(false);
		if (exited) next();
		else next(false);
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
