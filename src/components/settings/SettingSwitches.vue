<template>
  <div v-if="user" class="mx-auto max-w-100">
    <!-- Alerts Toggle -->
    <ion-item lines="none" color="tertiary" class="ion-no-padding px-2">
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

    <!-- Balloons Toggle -->
    <ion-item lines="none" color="tertiary" class="ion-no-padding px-2">
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

    <!-- Popovers -->
    <ion-popover trigger="balloon-info" trigger-action="click" class="cabin-sketch-regular shadow-lg">
      <div class="p-4 text-sm text-black bg-tertiary">
        <p class="font-bold mb-1 underline decoration-secondary">Incoming Balloons</p>
        <p>Toggle off to stop receiving balloons from strangers. <strong>You can still send balloons to others!</strong></p>
      </div>
    </ion-popover>

    <ion-popover trigger="notif-info" trigger-action="click" class="cabin-sketch-regular shadow-lg">
      <div class="p-4 text-sm text-black bg-tertiary">
        <p class="font-bold mb-2 underline decoration-secondary">Why enable Alerts?</p>
        <ul class="list-disc pl-4 space-y-1">
          <li>Receive sketches from your friends</li>
          <li v-if="!isNative()">Get daily reminders</li>
        </ul>
      </div>
    </ion-popover>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonItem, IonLabel, IonToggle, IonPopover } from '@ionic/vue'
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
    // Revert on failure
    if (user.value?.balloon) {
      user.value.balloon.disabled = !newState
    }
  })
}

function handleNotificationChange() {
  deviceNotificationsAllowed.value ? disableNotifications() : requestNotifications()
}
</script>

<style scoped>
/* Ensure popovers match the sketch/paper theme */
ion-popover {
  --background: var(--ion-color-tertiary);
  --backdrop-opacity: 0.2;
}

ion-popover::part(content) {
  border-radius: 20px;
  border: 2px solid rgba(0, 0, 0, 0.05);
}

ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}
</style>