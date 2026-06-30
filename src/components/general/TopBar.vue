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
          @click="() => openMenu(Menu.Shop)"
          class="active:scale-90 transition-transform m-0"
        >
          <ion-icon :icon="storefrontOutline" class="text-[30px] text-black shrink-0" slot="icon-only" />
        </ion-button>

        <ion-button
          fill="clear"
          @click="openPanel()"
          class="active:scale-90 transition-transform m-0"
        >
          <div class="flex items-center group">
            <div class="relative shrink-0">
              <ion-icon :icon="chatbubblesOutline" class="text-[30px] text-black" />
              <span
                v-if="totalUnreadCount > 0"
                class="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
              >
                {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
              </span>
            </div>

            <div class="flex items-center gap-1 ml-2">
              <ion-icon :icon="peopleOutline" class="text-[18px] text-green-600" />
              <span class="cabin-sketch-regular text-[13px] font-bold text-black leading-none">
                {{ onlineFriends.length }}
              </span>
            </div>
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
  chatbubblesOutline,
  bulbOutline,
  notificationsOutline,
  storefrontOutline,
  peopleOutline,
} from "ionicons/icons";
import { Menu } from "@/draw/types/draw.types";
import { useMenuStore } from "@/store/menu.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { storeToRefs } from "pinia";
import { useFriendStore } from "@/store/friend.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";

defineProps<{ title: string }>();

const { openMenu } = useMenuStore();
const { openPanel } = useChatWidgetStore();
const { onlineFriends } = storeToRefs(useFriendStore());
const { totalUnreadCount } = storeToRefs(useChatStore());

const { unseen } = storeToRefs(useInAppNotificationStore());

const r = useIonRouter();

const openNotifications = () => {
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
</style>