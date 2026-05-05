<template>
  <ion-page class="slide-page">
    <SubPageBar title="Settings" />

    <ion-content class="bg-background">
      <!-- Increased max-width for a more expansive feel -->
      <div class="max-w-3xl px-8 pt-6 bot-pad-safe flex flex-col min-h-full">

        <div class="grow space-y-8">

          <section class="bg-primary/5 rounded-[2.5rem] p-4 border border-black/5 shadow-sm transition-all">
            <h3 class="cabin-sketch-regular text-lg font-bold text-black/40 px-2 mb-2 uppercase tracking-wider">
              Preferences
            </h3>
            <SettingSwitches />
          </section>

          <section v-if="user?.subscriptions?.length" class="animate-fade-in bg-primary/5 rounded-[2.5rem] p-4 border border-black/5 shadow-sm transition-all">
            <h3 class="cabin-sketch-regular text-lg font-bold text-black/40 px-2 mb-2 uppercase tracking-wider">
              Network Sync
            </h3>
            <SubscriptionManager
              :subscriptions="user.subscriptions"
              @delete="handleDeleteSubscription"
            />
          </section>

        </div>

        <!-- Links moved to the bottom -->
        <div class="mt-auto pt-12 pb-6 flex justify-center">
          <SettingLinks />
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/service/toast.service'

import SubPageBar from '@/components/general/SubPageBar.vue'
import SettingLinks from '@/components/settings/SettingLinks.vue'
import SubscriptionManager from '@/components/settings/SubscriptionManager.vue'
import SettingSwitches from '@/components/settings/SettingSwitches.vue'

const authStore = useAuthStore()
const { user } = storeToRefs(authStore)
const { toast } = useToast()

const handleDeleteSubscription = async (sub: any) => {
  try {
    // await api.deleteSubscription(sub.fingerprint)
    toast('Device removed successfully')
  } catch (e) {
    toast('Could not remove device', { color: 'danger' })
  }
}

const logout = () => {
  authStore.logout()
}
</script>

<style scoped>
@reference "@/theme/main.css";

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

ion-item {
  --background: transparent;
  --border-color: rgba(0, 0, 0, 0.05);
  --inner-padding-end: 0;
}

ion-accordion {
  --background: transparent;
}

ion-content::part(scroll) {
  display: flex;
  flex-direction: column;
}
</style>