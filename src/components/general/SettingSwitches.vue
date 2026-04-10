<template>
  <div v-if="user" class="mx-auto max-w-100 bg-background">

    <ion-item lines="none" class="ion-no-padding px-4">
      <ion-icon
        slot="start"
        :icon="svg(deviceNotificationsAllowed ? mdiBellRing : mdiBellOff)"
        class="text-gray-600 mr-2"
      />

      <ion-label class="cabin-sketch-regular font-bold text-lg">
        Alerts
        <ion-button fill="clear" id="notif-info" class="h-6 w-6 m-0 p-0">
          <ion-icon slot="icon-only" :icon="svg(mdiInformationOutline)" size="small" class="text-gray-400" />
        </ion-button>
      </ion-label>

      <ion-toggle
        slot="end"
        mode="ios"
        color="secondary"
        :checked="!!deviceNotificationsAllowed"
        @ionChange="handleNotificationChange"
      />
    </ion-item>

    <ion-item lines="full" class="ion-no-padding px-4">
      <ion-icon slot="start" :icon="svg(mdiBalloon)" class="text-secondary mr-2" />

      <ion-label class="cabin-sketch-regular font-bold text-lg">
        Balloons
        <ion-button fill="clear" id="balloon-info" class="h-6 w-6 m-0 p-0">
          <ion-icon slot="icon-only" :icon="svg(mdiInformationOutline)" size="small" class="text-gray-400" />
        </ion-button>
      </ion-label>

      <ion-toggle
        slot="end"
        mode="ios"
        color="secondary"
        :checked="!user.balloon?.disabled"
        @ionChange="handleBalloonChange"
      />
    </ion-item>

    <ion-popover trigger="balloon-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-sm text-black">
        <p class="font-bold mb-1">Incoming Balloons</p>
        <p>Toggle off to stop receiving balloons from strangers. <strong>You can still send balloons to others!</strong></p>
      </div>
    </ion-popover>

    <ion-popover trigger="notif-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-sm text-black">
        <ul class="list-disc pl-4 space-y-1">
          <li>Receive sketches from your friends</li>
          <li v-if="!isNative()">Get daily reminders</li>
          <li v-if="!isNative()">Use the SketchMate widget</li>
        </ul>
      </div>
    </ion-popover>

  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonItem, IonLabel, IonPopover, IonToggle } from '@ionic/vue'
import { isNative, svg } from '@/helper/general.helper'
import { mdiBalloon, mdiBellOff, mdiBellRing, mdiInformationOutline } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { useAPI } from '@/service/api/api.service'
import { useNotificationStore } from '@/store/notification.store'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'

const { user } = storeToRefs(useAuthStore())
const { deviceNotificationsAllowed } = storeToRefs(useNotificationStore())
const api = useAPI()

function handleBalloonChange() {
  if (!user.value) return
  if (!user.value.balloon) user.value.balloon = { disabled: false }

  const newState = !user.value.balloon.disabled
  user.value.balloon.disabled = newState

  api.updateUser({
    _id: user.value._id,
    balloon: { ...user.value.balloon, disabled: newState }
  }).catch(() => {
    user.value!.balloon!.disabled = !newState
  })
}

function handleNotificationChange() {
  deviceNotificationsAllowed.value ? disableNotifications() : requestNotifications()
}
</script>

<style scoped>
/* Ensure Ionic items match your background/sketch vibe */
ion-item {
  --background: var( --ion-color-tertiary);
  --padding-start: 0;
  --padding-end: 0;
}

/* Customizing the popover style to look like paper */
ion-popover {
  --background: var( --ion-color-tertiary);
  --box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>