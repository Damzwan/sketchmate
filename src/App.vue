<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady" bg-color="bg-background" />
    <ion-router-outlet />
    <LazyMount :when="isLoggedIn && isWhatsNewOpen"><WhatsNewModal /></LazyMount>
    <LazyMount :when="isLoggedIn && isCompetitionResultsOpen" :retain="retainHeavyOverlays"><WinnersModal /></LazyMount>
    <!-- Toast listeners stay live after login; the heavy panel loads on first open. -->
    <LazyMount :when="isLoggedIn"><ChatToasts /></LazyMount>
    <LazyMount :when="isLoggedIn && chatPanelOpen" :retain="retainHeavyOverlays"><ChatPanel /></LazyMount>

    <GlobalToast />
    <LazyMount :when="isLoggedIn && photoSwiperOpen" :retain="retainHeavyOverlays"><PhotoSwiper /></LazyMount>
    <LazyMount :when="isLoggedIn && viewProfileMenuOpen" :retain="retainHeavyOverlays"><UserContextSheet/></LazyMount>
    <LazyMount :when="feedbackMenuOpen" :retain="retainHeavyOverlays"><FeedbackMenu /></LazyMount>
    <LazyMount :when="isLoggedIn && dateOfBirthOpen"><DateOfBirthConfirmation /></LazyMount>
    <LazyMount :when="isLoggedIn && parentalControlsOpen"><ParentalControlsModal /></LazyMount>
    <LazyMount :when="isLoggedIn && confettiVisible"><Confetti /></LazyMount>
    <LazyMount :when="isLoggedIn && balloonVisible"><ReceivedBalloon /></LazyMount>
    <LazyMount :when="balloonMenuOpen"><BalloonMenu/></LazyMount>
    <LazyMount :when="connectionMenuOpen" :retain="retainHeavyOverlays"><ConnectionHub /></LazyMount>
    <LazyMount :when="isLoggedIn && moderationMenuOpen"><ModerationMenu/></LazyMount>
    <LazyMount :when="sharePostMenuOpen" :retain="retainHeavyOverlays"><SharePostMenu/></LazyMount>
    <LazyMount :when="reportMenuOpen"><ReportMenu/></LazyMount>
    <LazyMount :when="isLoggedIn && shareToastsVisible"><ShareToasts/></LazyMount>
    <LazyMount :when="isShopOpen" :retain="retainHeavyOverlays"><Shop/></LazyMount>
    <LazyMount :when="isPaywallOpen" :retain="retainHeavyOverlays"><PaywallModal/></LazyMount>
    <LazyMount :when="isOnlineUpgradeMenuOpen"><OnlineUpgradeModal/></LazyMount>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { defineAsyncComponent, onMounted, ref, watch } from "vue";
import LazyMount from "@/components/general/LazyMount.vue";
// Eagerly loaded components
import CircularLoader from "@/components/general/loaders/CircularLoader.vue";
import { useWhatsNewPrompt } from "@/composables/general/useWhatsNewPrompt";
import {
	setupBackButtonBehavior,
	setupPWAPromptListener,
	setupRouterReadyWatcher,
} from "@/helper/general.helper";
import { useActiveViewSync } from "@/service/activeViewSync";
import { installMemoryPressureHandlers } from "@/service/memoryPressureHandlers";
import { useAuthStore } from "@/store/auth.store";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";
import { useMenuStore } from "@/store/menu.store";
import { useNetworkStore } from "@/store/network.store";
import { useOverlayRuntimeStore } from "@/store/overlayRuntime.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useSessionStore } from "@/store/session.store";

// LAZY LOADED COMPONENTS (Will create separate js chunks)
const GlobalToast = defineAsyncComponent(
	() => import("@/components/general/GlobalToast.vue"),
);
const WhatsNewModal = defineAsyncComponent(
	() => import("@/components/general/WhatsNewModal.vue"),
);
const WinnersModal = defineAsyncComponent(
	() => import("@/components/competition/WinnersModal.vue"),
);
const PhotoSwiper = defineAsyncComponent(
	() => import("@/components/photoswiper/PhotoSwiper.vue"),
);
const loadChatPanel = () => import("./components/chat/ChatWidget.vue");
const ChatPanel = defineAsyncComponent(loadChatPanel);
const ChatToasts = defineAsyncComponent(
	() => import("@/components/chat/ChatToasts.vue"),
);
const FeedbackMenu = defineAsyncComponent(
	() => import("@/components/general/FeedbackMenu.vue"),
);
const DateOfBirthConfirmation = defineAsyncComponent(
	() => import("@/components/general/DateOfBirthConfirmation.vue"),
);
const ParentalControlsModal = defineAsyncComponent(
	() => import("@/components/settings/ParentalControlsModal.vue"),
);
const Confetti = defineAsyncComponent(
	() => import("@/components/subscription/Confetti.vue"),
);
const ReceivedBalloon = defineAsyncComponent(
	() => import("@/components/balloon/ReceivedBalloon.vue"),
);

const BalloonMenu = defineAsyncComponent(
	() => import("@/components/balloon/BalloonMenu.vue"),
);

const ConnectionHub = defineAsyncComponent(
	() => import("@/components/general/ConnectionHub.vue"),
);

const UserContextSheet = defineAsyncComponent(
	() => import("@/components/profile/UserContextSheet.vue"),
);

const ModerationMenu = defineAsyncComponent(
	() => import("@/components/moderation/ModerationMenu.vue"),
);

const SharePostMenu = defineAsyncComponent(
	() => import("@/components/general/SharePostMenu.vue"),
);

const ReportMenu = defineAsyncComponent(
	() => import("@/components/moderation/ReportMenu.vue"),
);

const ShareToasts = defineAsyncComponent(
	() => import("@/components/draw/send/ShareToasts.vue"),
);

const Shop = defineAsyncComponent(() => import("@/components/shop/Shop.vue"));

const PaywallModal = defineAsyncComponent(
	() => import("@/components/subscription/PaywallModal.vue"),
);
const OnlineUpgradeModal = defineAsyncComponent(
	() => import("@/components/general/OnlineUpgradeModal.vue"),
);

const ionRouter = useIonRouter();
const { initIonRouter } = useAuthStore();
initIonRouter(ionRouter);
useActiveViewSync();

const { isAuthLoading, isLoggedIn } = storeToRefs(useAuthStore());

// Flags that gate the deferred overlay chunks (see LazyMount). Each modal is
// opened by an external store flag, so it can stay unmounted — and its JS chunk
// off the boot path — until first opened.
const {
	isShopOpen,
	isPaywallOpen,
	isOnlineUpgradeMenuOpen,
	feedbackMenuOpen,
	connectionMenuOpen,
	sharePostMenuOpen,
	reportMenuOpen,
	balloonMenuOpen,
	viewProfileMenuOpen,
	moderationMenuOpen,
	isWhatsNewOpen,
	isCompetitionResultsOpen,
} = storeToRefs(useMenuStore());

const { open: photoSwiperOpen } = storeToRefs(usePhotoSwiper());
const { isOpen: dateOfBirthOpen } = storeToRefs(useDateOfBirthModalStore());
const {
	chatPanelOpen,
	parentalControlsOpen,
	confettiVisible,
	balloonVisible,
	shareToastsVisible,
} = storeToRefs(useOverlayRuntimeStore());

const networkStore = useNetworkStore();

const isRouterReady = ref(false);
const retainHeavyOverlays =
	!document.documentElement.classList.contains("low-end");
let chatPanelPrefetchQueued = false;
watch(
	isLoggedIn,
	(loggedIn) => {
		if (
			!loggedIn ||
			chatPanelPrefetchQueued ||
			document.documentElement.classList.contains("low-end") ||
			!("requestIdleCallback" in window)
		)
			return;
		chatPanelPrefetchQueued = true;
		window.requestIdleCallback(() => void loadChatPanel());
	},
	{ immediate: true },
);

onMounted(async () => {
	const authStore = useAuthStore();
	await authStore.waitUntilInitialized();

	if (authStore.isLoggedIn) {
		const { queryParams } = useSessionStore();
		const mate = queryParams?.get("mate");
		if (mate) {
			const { useUserContextSheet } = await import(
				"@/composables/profile/useUserContextSheet"
			);
			const { openUserActions } = useUserContextSheet();
			openUserActions({ _id: mate });
		}
	}
});

setupRouterReadyWatcher(isRouterReady, isAuthLoading);
setupBackButtonBehavior();
setupPWAPromptListener();
networkStore.init();
installMemoryPressureHandlers();
useWhatsNewPrompt();
</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}
</style>
