<template>
  <div class="w-full flex justify-center items-center py-3">
    <ion-icon
      :icon="svg((deviceNotificationsAllowed ? mdiBellRing : mdiBellOff))"
      class="w-7 h-7 pr-3 fill-gray-600"
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
import { storeToRefs } from 'pinia'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'
import { useNotificationStore } from '@/store/notification.store'

const { deviceNotificationsAllowed } = storeToRefs(useNotificationStore())

function handleNotificationChange() {
  deviceNotificationsAllowed.value ? disableNotifications() : requestNotifications()
}

</script>

<style scoped>

</style>