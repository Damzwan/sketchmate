<template>
  <ion-header class="ion-no-border bg-background relative w-full z-50 top-pad-safe shadow-none">
    <div class="flex items-center justify-between px-3 h-[50px]">
      <div class="flex items-center space-x-4">
        <p class="cabin-sketch-regular text-2xl font-light text-black w-[80px]">
          {{ title }}
        </p>

        <ion-button
          fill="outline"
          class="sketch-button-rounded h-9 m-0"
          @click="openProMenu"
        >
          <div class="flex items-center space-x-1 px-1">
            <ion-icon :icon="sparklesOutline" class="text-black text-[12px]" />
            <span class="cabin-sketch-regular text-black text-[17px] font-bold lowercase">plus+</span>
          </div>
        </ion-button>
      </div>

      <div class="flex items-center space-x-4 pr-2">
        <button class="flex items-center p-1 active:scale-90 transition-transform group" @click="openPanel()">
          <ion-icon :icon="chatbubblesOutline" class="text-[30px] text-black shrink-0" />

          <div class="flex flex-col gap-1 ml-2 mt-0.5">

            <div v-if="totalUnreadCount > 0" class="flex items-center gap-1.5 h-3">
      <span class="cabin-sketch-regular text-[13px] font-bold text-red-600 leading-none">
        {{ totalUnreadCount }}
      </span>
              <div class="w-1.5 h-1.5 bg-red-500 rounded-full shadow-sm"></div>
            </div>

            <div class="flex items-center gap-1.5 h-3">
      <span class="cabin-sketch-regular text-[13px] font-bold text-black leading-none">
        {{ onlineFriends.length }}
      </span>
              <div class="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm animate-pulse"></div>
            </div>

          </div>
        </button>

        <button
          @click="() => openMenu(Menu.FeedbackMenu)"
          class="active:scale-90 transition-transform flex items-center"
        >
          <ion-icon :icon="megaphoneOutline" class="text-[26px] text-black" />
        </button>

        <button
          @click="openNotifications"
          class="active:scale-90 transition-transform flex items-center"
        >
          <ion-icon :icon="notificationsOutline" class="text-[26px] text-black" />
        </button>
      </div>

    </div>
  </ion-header>
</template>

<script setup lang="ts">
import { IonHeader, IonIcon, IonButton } from '@ionic/vue'
import {
  sparklesOutline,
  notificationsOutline,
  peopleOutline,
  ticketOutline,
  bulbOutline,
  megaphoneOutline, chatbubblesOutline, chatbubbleOutline
} from 'ionicons/icons'
import { mdiMessageAlertOutline } from '@mdi/js'
import { Menu } from '@/draw/types/draw.types'
import { svg } from '@/helper/general.helper'
import { useMenuStore } from '@/store/menu.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useChatStore } from '@/store/chat.store'
import { storeToRefs } from 'pinia'
import { useFriendStore } from '@/store/friend.store'

defineProps<{ title: string }>()

const { openMenu } = useMenuStore()
const { openPanel } = useChatWidgetStore()
const {onlineFriends} = storeToRefs(useFriendStore())
const {totalUnreadCount} = storeToRefs(useChatStore())

const openProMenu = () => { /* logic */
}
const openNotifications = () => { /* logic */
}

</script>

<style scoped>

/* Rounded Sketchy Border for ion-button */
.sketch-button-rounded {
  --border-width: 2px;
  --border-color: rgba(0, 0, 0, 0.2);
  /* This creates a wobbly oval instead of a rectangle */
  --border-radius: 50px 20px 50px 20px / 20px 50px 20px 50px;
  --padding-start: 10px;
  --padding-end: 10px;
}


/* Custom shadow/glow for the badge */
.shadow-sm {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>