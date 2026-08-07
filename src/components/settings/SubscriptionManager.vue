<template>
  <div class="w-full">
    <ConfirmationAlert
      header="Remove subscription"
      message="You will no longer receive notifications on this device"
      v-model:isOpen="deleteSubscriptionAlertOpen"
      confirmationtext="Delete"
      @confirm="confirmDelete"
      @didDismiss="onAlertDismiss"
    />

    <ion-accordion-group v-if="subscriptions?.length" class="overflow-hidden">
      <ion-accordion value="first" class="bg-transparent">
        <ion-item slot="header" color="tertiary" lines="none" class="rounded-2xl">
          <ion-label class="cabin-sketch-regular font-bold text-black text-lg">
            Active Devices ({{ subscriptions.length }})
          </ion-label>
        </ion-item>

        <div slot="content" class="bg-black/5 mt-1 rounded-2xl overflow-hidden">
          <ion-item
            v-for="sub in subscriptions"
            :key="sub.fingerprint"
            color="tertiary"
            lines="full"
          >
            <ion-label class="text-sm font-bold text-black/70 italic px-2">
              {{ sub.model }}, {{ sub.platform }}
            </ion-label>

            <ion-spinner
              v-if="pendingFingerprint === sub.fingerprint"
              slot="end"
              name="crescent"
              class="text-red-600 px-2"
            />
            <ion-icon
              v-else
              slot="end"
              :icon="svg(mdiClose)"
              class="text-red-600 cursor-pointer active:scale-75 transition-transform px-2"
              :class="{ 'opacity-40 pointer-events-none': !!pendingFingerprint }"
              @click="openDeleteAlert(sub)"
            />
          </ion-item>
        </div>
      </ion-accordion>
    </ion-accordion-group>
  </div>
</template>

<script setup lang="ts">
import {
	IonAccordion,
	IonAccordionGroup,
	IonIcon,
	IonItem,
	IonLabel,
	IonSpinner,
} from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import { ref } from "vue";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import { svg } from "@/helper/general.helper";
import type { NotificationSubscription } from "@/types/server.types";

defineProps<{
	subscriptions: NotificationSubscription[];
	pendingFingerprint?: string | null;
}>();

const emit =
	defineEmits<(e: "delete", sub: NotificationSubscription) => void>();

const deleteSubscriptionAlertOpen = ref(false);
const selectedSub = ref<NotificationSubscription | null>(null);

function openDeleteAlert(sub: NotificationSubscription) {
	selectedSub.value = sub;
	deleteSubscriptionAlertOpen.value = true;
}

function confirmDelete() {
	if (!selectedSub.value) return;
	emit("delete", selectedSub.value);
	deleteSubscriptionAlertOpen.value = false;
}

function onAlertDismiss() {
	// Clear selection whether the user confirmed, cancelled, or dismissed
	selectedSub.value = null;
}
</script>