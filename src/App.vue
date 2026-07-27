<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady" bg-color="bg-background" />
    <ion-router-outlet />
    <LazyMount :when="isLoggedIn"><WhatsNewModal /></LazyMount>
    <!-- Toast listeners stay live after login; the heavy panel loads on first open. -->
    <LazyMount :when="isLoggedIn"><ChatToasts /></LazyMount>
    <LazyMount :when="isLoggedIn && chatPanelOpen"><ChatPanel /></LazyMount>

    <GlobalToast />
    <LazyMount :when="isLoggedIn && photoSwiperOpen"><PhotoSwiper /></LazyMount>
    <LazyMount :when="isLoggedIn && viewProfileMenuOpen"><UserContextSheet/></LazyMount>
    <LazyMount :when="feedbackMenuOpen"><FeedbackMenu /></LazyMount>
    <LazyMount :when="isLoggedIn"><DateOfBirthConfirmation /></LazyMount>
    <LazyMount :when="isLoggedIn"><Confetti /></LazyMount>
    <LazyMount :when="isLoggedIn"><ReceivedBalloon /></LazyMount>
    <LazyMount :when="balloonMenuOpen"><BalloonMenu/></LazyMount>
    <LazyMount :when="connectionMenuOpen"><ConnectionHub /></LazyMount>
    <LazyMount :when="isLoggedIn"><ModerationMenu/></LazyMount>
    <LazyMount :when="sharePostMenuOpen"><SharePostMenu/></LazyMount>
    <LazyMount :when="reportMenuOpen"><ReportMenu/></LazyMount>
    <LazyMount :when="isLoggedIn"><ShareToasts/></LazyMount>
    <LazyMount :when="isShopOpen"><Shop/></LazyMount>
    <LazyMount :when="isPaywallOpen"><PaywallModal/></LazyMount>
    <LazyMount :when="isOnlineUpgradeMenuOpen"><OnlineUpgradeModal/></LazyMount>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, useIonRouter } from "@ionic/vue";
import { defineAsyncComponent, onMounted, ref, watch } from "vue";
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import {
	setupBackButtonBehavior,
	setupPWAPromptListener,
	setupRouterReadyWatcher,
} from "@/helper/general.helper";
import { storeToRefs } from "pinia";
import { useNetworkStore } from "@/store/network.store";
import { useAuthStore } from "@/store/auth.store";
import { useActiveViewSync } from "@/service/activeViewSync";

// Eagerly loaded components
import CircularLoader from "@/components/general/loaders/CircularLoader.vue";
import WhatsNewModal from "@/components/general/WhatsNewModal.vue";
import LazyMount from "@/components/general/LazyMount.vue";
import { useMenuStore } from "@/store/menu.store";
import { useSessionStore } from "@/store/session.store";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import OnlineUpgradeModal from "@/components/general/OnlineUpgradeModal.vue";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";

// LAZY LOADED COMPONENTS (Will create separate js chunks)
const GlobalToast = defineAsyncComponent(
	() => import("@/components/general/GlobalToast.vue"),
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

const ionRouter = useIonRouter();
const { initIonRouter } = useAuthStore();
initIonRouter(ionRouter);
useActiveViewSync();

const { isAuthLoading, showForceUpdateModal, isLoggedIn } = storeToRefs(
	useAuthStore(),
);

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
} = storeToRefs(useMenuStore());

const { open: photoSwiperOpen } = storeToRefs(usePhotoSwiper());
const { isExpanded: chatPanelOpen } = storeToRefs(useChatWidgetStore());

const networkStore = useNetworkStore();

const isRouterReady = ref(false);
const { openUserActions } = useUserContextSheet();

let chatPanelPrefetchQueued = false;
watch(
	isLoggedIn,
	(loggedIn) => {
		if (
			!loggedIn ||
			chatPanelPrefetchQueued ||
			!("requestIdleCallback" in window)
		)
			return;
		chatPanelPrefetchQueued = true;
		// Warm only the JS chunk during genuine browser idle time. The panel
		// remains unmounted, and no timeout forces parsing during a draw frame.
		window.requestIdleCallback(() => void loadChatPanel());
	},
	{ immediate: true },
);

onMounted(async () => {
	defineCustomElements(window);
	const authStore = useAuthStore();
	await authStore.waitUntilInitialized();

	if (authStore.isLoggedIn) {
		const { queryParams } = useSessionStore();
		const mate = queryParams?.get("mate");
		if (mate) {
			openUserActions({ _id: mate });
		}
	}
});

setupRouterReadyWatcher(isRouterReady, isAuthLoading);
setupBackButtonBehavior();
setupPWAPromptListener();
networkStore.init();
</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}
</style>
