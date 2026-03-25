<template>
  <div v-if="isPro"
       class="p-2 bg-primary rounded-xl border border-primary flex flex-col relative overflow-hidden shadow-sm max-w-sm mx-auto">

    <div class="relative z-10">
      <h3 class="cabin-sketch-regular text-xl font-bold text-secondary mb-1">
        Supporter ❤️
      </h3>
      <p class="text-sm text-gray-600 mb-1 leading-tight">
        You are helping the app remain free, thank you
      </p>

      <ion-button
        fill="outline"
        color="medium"
        size="small"
        class="normal-case text-xs self-start"
        @click="manageSubscription"
      >
        Manage / Cancel
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useSubscriptionStore } from '@/store/subscription.store'

const subscriptionStore = useSubscriptionStore()
const { isPro } = storeToRefs(subscriptionStore)

async function manageSubscription() {
  await subscriptionStore.manageSubscription()
}
</script>