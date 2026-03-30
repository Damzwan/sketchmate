<template>
  <ion-modal
    :is-open="open"
    @will-dismiss="close"
    :presenting-element="presentingElement"
  >

    <div class="safe-area bg-background w-full h-full flex flex-col">
      <ion-toolbar color="tertiary">
        <ion-buttons slot="start">
          <ion-button @click="close">
            <ion-icon :icon="arrowBack" />
          </ion-button>
        </ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>

      <!-- SCROLLABLE -->
      <ion-content v-if="user" class="bg-background">

        <div class="flex flex-col h-full">
          <div class="grow">
            <div class="w-full bg-warning mx-auto rounded-md p-4" v-if="firebaseUser?.isAnonymous">
              <p class="cabin-sketch-regular text-lg">Upgrade your account</p>
              <p class="text-sm">You're using a guest profile. Create an account to save your progress.</p>
              <ion-button fill="outline" color="dark" class="pt-4" id="openUpgradeAccountModal">Upgrade</ion-button>
              <UpgradeAccountModal />
            </div>

            <SupporterCard class="mt-4" />
            <SubscriptionCard class="mt-4"/>

            <ProfileCustomization />

            <div class="p-6 text-gray-500 text-sm mx-auto flex flex-col items-center justify-center">
              <p class="text-lg -ml-12">Enable notifications to:</p>
              <div>
                <ul class="list-disc list-inside">
                  <li>Receive sketches from your friends</li>
                  <li v-if="isNative()">Get daily reminders</li>
                  <li v-if="isNative()">Use the SketchMate widget</li>
                </ul>
              </div>
            </div>

            <NotificationSwitch />

            <div class="w-full flex justify-center items-center">
              <ConfirmationAlert header="Remove subscription"
                                 message="You will no longer receive notifications on this device"
                                 v-model:isOpen="deleteSubscriptionAlertOpen" confirmationtext="Delete"
                                 @confirm="deleteSubscription" />
              <ion-accordion-group v-if="user?.subscriptions.length > 0">
                <ion-accordion value="first">
                  <ion-item slot="header" color="tertiary">
                    <ion-label>Active Devices
                      {{ user?.subscriptions.length > 0 ? `(${user?.subscriptions.length})` : '' }}
                    </ion-label>
                  </ion-item>
                  <div class="ion-padding" slot="content" v-if="user?.subscriptions">
                    <ion-item v-for="subscription of user.subscriptions" :key="subscription.fingerprint"
                              color="tertiary">
                      <ion-icon aria-hidden="true" :icon="svg(mdiClose)" slot="end" class="fill-red-600 cursor-pointer"
                                @click="openDeleteSubscriptionAlert(subscription)" />
                      {{ subscription.model }}, {{ subscription.platform }}
                    </ion-item>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            </div>
          </div>
          <SettingLinks />
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonModal,
  IonTitle,
  IonToolbar
} from '@ionic/vue'
import { ref } from 'vue'
import { useAuthStore } from '@/store/auth.store'
import { isNative, svg } from '@/helper/general.helper'
import { useAPI } from '@/service/api/api.service'
import { storeToRefs } from 'pinia'
import { arrowBack } from 'ionicons/icons'
import { onBeforeRouteLeave } from 'vue-router'
import { setNotificationsAllowed } from '@/helper/notification.helper'
import { mdiClose } from '@mdi/js'
import SettingLinks from '@/components/settings/SettingLinks.vue'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { NotificationSubscription } from '@/types/server.types'
import ProfileCustomization from '@/components/account/ProfileCustomization.vue'
import NotificationSwitch from '@/components/general/NotificationSwitch.vue'
import UpgradeAccountModal from '@/components/settings/UpgradeAccountModal.vue'
import SupporterCard from '@/components/subscription/SupporterCard.vue'
import SubscriptionCard from '@/components/subscription/SubscriptionCard.vue'

const { user, firebaseUser } = storeToRefs(useAuthStore())
const api = useAPI()


const deleteSubscriptionAlertOpen = ref(false)
const subscriptionToDelete = ref<NotificationSubscription>()

setNotificationsAllowed() //TODO should be integrated in a notifications service...


defineProps({
  open: {
    type: Boolean,
    required: true
  },
  presentingElement: {
    type: HTMLElement,
    required: false
  }
})
const emit = defineEmits(['update:open'])

function close() {
  emit('update:open', false)
}


function deleteSubscription() {
  api.unsubscribe({ user_id: user.value!._id, fingerprint: subscriptionToDelete.value!.fingerprint })
  user.value!.subscriptions = user.value!.subscriptions.filter(sub => sub.fingerprint != subscriptionToDelete.value!.fingerprint)
}

onBeforeRouteLeave(() => close())

function openDeleteSubscriptionAlert(subscription: NotificationSubscription) {
  subscriptionToDelete.value = subscription
  deleteSubscriptionAlertOpen.value = true
}
</script>

<style scoped lang="scss">
.badge {
  background: var(--ion-color-secondary);
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 4;
}

ion-modal {
  --height: 100%;
  --width: 100%;
  --max-width: 100%;
}

ion-content::part(scroll) {
  padding-bottom: -12px
}
</style>
