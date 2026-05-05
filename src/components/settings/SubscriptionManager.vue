<template>
  <div class="w-full">
    <ConfirmationAlert
      header="Remove subscription"
      message="You will no longer receive notifications on this device"
      v-model:isOpen="deleteSubscriptionAlertOpen"
      confirmationtext="Delete"
      @confirm="deleteSubscription"
    />

    <!-- Internal group is now transparent to blend into the parent section -->
    <ion-accordion-group v-if="subscriptions?.length" class="overflow-hidden">
      <ion-accordion value="first" class="bg-transparent">
        <ion-item slot="header" color="tertiary" lines="none" class="rounded-2xl">
          <ion-label class="cabin-sketch-regular font-bold text-black text-lg">
            Active Devices ({{ subscriptions.length }})
          </ion-label>
        </ion-item>

        <div slot="content" class="bg-black/5 mt-1 rounded-2xl overflow-hidden">
          <ion-item v-for="sub in subscriptions" :key="sub.fingerprint" color="tertiary" lines="full">
            <ion-label class="text-sm font-bold text-black/70 italic px-2">
              {{ sub.model }}, {{ sub.platform }}
            </ion-label>
            <ion-icon
              slot="end"
              :icon="svg(mdiClose)"
              class="text-red-600 cursor-pointer active:scale-75 transition-transform px-2"
              @click="openDeleteAlert(sub)"
            />
          </ion-item>
        </div>
      </ion-accordion>
    </ion-accordion-group>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonAccordion, IonAccordionGroup, IonItem, IonLabel, IonIcon } from '@ionic/vue'
import { mdiClose } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'

defineProps<{ subscriptions: any[] }>()
const emit = defineEmits(['delete'])

const deleteSubscriptionAlertOpen = ref(false)
const selectedSub = ref(null)

const openDeleteAlert = (sub: any) => {
  selectedSub.value = sub
  deleteSubscriptionAlertOpen.value = true
}

const deleteSubscription = () => {
  emit('delete', selectedSub.value)
  deleteSubscriptionAlertOpen.value = false
}
</script>