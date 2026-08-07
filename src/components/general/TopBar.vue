<template>
  <ion-header class="ion-no-border bg-background relative w-full z-50 top-pad-safe shadow-none">
    <div class="flex items-center justify-between px-3 h-[50px]">
      <div class="flex items-center space-x-4">
        <p class="cabin-sketch-regular text-2xl font-light text-black w-[80px]">
          {{ title }}
        </p>
      </div>

      <div class="flex items-center space-x-4 pr-2">
        <ion-button
          fill="clear"
          @click="openShop"
          class="active:scale-90 transition-transform m-0"
        >
          <ion-icon :icon="storefrontOutline" class="text-[30px] text-black shrink-0" slot="icon-only" />
        </ion-button>

        <ion-button
          fill="clear"
          @click="openMessages"
          class="active:scale-90 transition-transform m-0"
        >
          <div class="flex items-center">
            <div class="relative shrink-0">
              <ion-icon :icon="chatbubblesOutline" class="text-[30px] text-black" />
              <span
                v-if="totalUnreadCount > 0"
                class="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
              >
                {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
              </span>
            </div>

            <!-- Presence: a labeled pill instead of a second bare icon — the
                 word "online" is the affordance. Hidden at zero (no dead UI);
                 taps fall through to the same chat panel where the online
                 mates actually live. -->
            <span v-if="onlineFriends.length > 0" class="online-pill ml-1.5">
              <span class="online-dot"></span>
              {{ onlineFriends.length }} online
            </span>
          </div>
        </ion-button>

        <ion-button
          fill="clear"
          @click="() => openMenu(Menu.FeedbackMenu)"
          class="active:scale-90 transition-transform m-0"
        >
          <ion-icon :icon="bulbOutline" class="text-[26px] text-black" slot="icon-only" />
        </ion-button>

        <ion-button
          fill="clear"
          @click="openNotifications"
          class="relative active:scale-90 transition-transform m-0"
        >
          <span
            v-if="unseen > 0"
            class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center z-10"
          >
            {{ unseen > 99 ? '99+' : unseen }}
          </span>
          <ion-icon :icon="notificationsOutline" class="text-[26px] text-black" slot="icon-only" />
        </ion-button>
      </div>

    </div>
  </ion-header>
</template>

<script setup lang="ts">
import { IonButton, IonHeader, IonIcon, useIonRouter } from "@ionic/vue";
import {
	bulbOutline,
	chatbubblesOutline,
	notificationsOutline,
	storefrontOutline,
} from "ionicons/icons";
import { storeToRefs } from "pinia";
import { masterAnimation } from "@/helper/animation.helper";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";

defineProps<{ title: string }>();

const menuStore = useMenuStore();
const { openMenu } = menuStore;
const chatWidgetStore = useChatWidgetStore();
const { openPanel } = chatWidgetStore;

const openShop = () => {
	trackEvent(mixpanelEvents.shopOpen, { source: "topbar" });
	openMenu(Menu.Shop);
};

const openMessages = () => {
	trackEvent(mixpanelEvents.messagesOpen, { source: "topbar" });
	openPanel();
};
const { onlineFriends } = storeToRefs(useFriendStore());
const { totalUnreadCount } = storeToRefs(useChatStore());

const { unseen } = storeToRefs(useInAppNotificationStore());

const r = useIonRouter();

const openNotifications = () => {
	trackEvent(mixpanelEvents.notificationsOpen, {
		unseen: unseen.value,
		source: "topbar",
	});
	r.push(FRONTEND_ROUTES.notifications, masterAnimation);
};
</script>

<style scoped>
/* Custom shadow/glow for the badge */
.shadow-sm {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Let absolute badges (notification count, unread) escape the button clip. */
ion-button::part(native) {
  overflow: visible;
  contain: none;
}

/* Presence pill: self-explanatory ("3 online"), green = live. */
.online-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #047857;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
.online-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #10b981;
  animation: online-pulse 2.4s ease-in-out infinite;
}
@keyframes online-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.8); }
}
</style>
