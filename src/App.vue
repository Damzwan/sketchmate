<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady || isAuthLoading" bg-color="bg-background" />
    <ion-router-outlet />
    <ForceUpdateModal v-if="isNative() && showForceUpdateModal" />
    <WhatsNewModal />
    <ChatBubble />

    <GlobalToast />
    <PhotoSwiper />
    <UserContextSheet/>

    <FeedbackMenu />
    <DateOfBirthConfirmation />
    <Confetti />
    <ReceivedBalloon />
    <BalloonMenu/>
    <ConnectionHub />
    <ModerationMenu/>
    <SharePostMenu/>
    <ReportMenu/>
    <ShareToasts/>
    <Shop/>
    <OnlineUpgradeModal/>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, useIonRouter } from "@ionic/vue";
import { defineAsyncComponent, onMounted, ref } from "vue";
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import {
	isNative,
	setupBackButtonBehavior,
	setupPWAPromptListener,
	setupRouterReadyWatcher,
} from "@/helper/general.helper";
import { storeToRefs } from "pinia";
import { useNetworkStore } from "@/store/network.store";
import { useAuthStore } from "@/store/auth.store";
import { useActiveViewSync } from "@/service/activeViewSync";

// Eagerly loaded components
import ForceUpdateModal from "@/components/general/ForceUpdateModal.vue";
import CircularLoader from "@/components/general/loaders/CircularLoader.vue";
import WhatsNewModal from "@/components/general/WhatsNewModal.vue";
import { useSessionStore } from "@/store/session.store";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import OnlineUpgradeModal from "@/components/general/OnlineUpgradeModal.vue";

// LAZY LOADED COMPONENTS (Will create separate js chunks)
const GlobalToast = defineAsyncComponent(
	() => import("@/components/general/GlobalToast.vue"),
);
const PhotoSwiper = defineAsyncComponent(
	() => import("@/components/photoswiper/PhotoSwiper.vue"),
);
const ChatBubble = defineAsyncComponent(
	() => import("./components/chat/ChatWidget.vue"),
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

const Shop = defineAsyncComponent(
	() => import("@/components/general/Shop.vue"),
);

const ionRouter = useIonRouter();
const { initIonRouter } = useAuthStore();
initIonRouter(ionRouter);
useActiveViewSync();

const { isAuthLoading, showForceUpdateModal } = storeToRefs(useAuthStore());
const networkStore = useNetworkStore();

const isRouterReady = ref(false);
const { openUserActions } = useUserContextSheet();

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