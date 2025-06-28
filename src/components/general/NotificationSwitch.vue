<template>
  <div class="w-full flex justify-center items-center py-3">
    <ion-icon
      :icon="svg((deviceNotificationsAllowed || localSubscription) ? mdiBellRing : mdiBellOff)"
      class="w-[28px] h-[28px] pr-3 fill-gray-600"
    />
    <ion-toggle
      :checked="deviceNotificationsAllowed"
      @ionChange="handleNotificationChange"
      mode="ios"
      :color="'secondary'"
    />
  </div>
</template>

<script setup lang="ts">

import { svg } from '@/helper/general.helper'
import { mdiBellOff, mdiBellRing } from '@mdi/js'
import { IonIcon, IonToggle } from '@ionic/vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'

const { user, deviceFingerprint, notificationsAllowed, localSubscription } = storeToRefs(useAuthStore())
const deviceNotificationsAllowed = computed(() => user.value?.subscriptions.some(s => s.fingerprint == deviceFingerprint.value) && notificationsAllowed.value)

function handleNotificationChange() {
  deviceNotificationsAllowed.value ? disableNotifications() : requestNotifications()
}

</script>

<style scoped>

</style>