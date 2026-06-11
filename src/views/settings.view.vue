<template>
  <ion-page class="slide-page">
    <SubPageBar title="Settings" />

    <ion-content class="bg-background">
      <div class="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-12 bot-pad-safe flex flex-col min-h-full">

        <div class="grow space-y-6">

          <section class="bg-white/50 border border-primary/20 rounded-[2rem] p-5 shadow-sm transition-all">
            <h3 class="cabin-sketch-regular text-lg font-black text-black/40 px-1 mb-3 uppercase tracking-wider">
              Account
            </h3>
            <AccountSettings />
          </section>

          <section class="bg-white/50 border border-primary/20 rounded-[2rem] p-5 shadow-sm transition-all">
            <h3 class="cabin-sketch-regular text-lg font-black text-black/40 px-1 mb-3 uppercase tracking-wider">
              Preferences
            </h3>
            <SettingSwitches />
          </section>

          <section
            v-if="user?.subscriptions?.length"
            class="animate-fade-in bg-white/50 border border-primary/20 rounded-[2rem] p-5 shadow-sm transition-all"
          >
            <h3 class="cabin-sketch-regular text-lg font-black text-black/40 px-1 mb-3 uppercase tracking-wider">
              Network Sync
            </h3>
            <SubscriptionManager
              :subscriptions="user.subscriptions"
              :pending-fingerprint="pendingFingerprint"
              @delete="handleDeleteSubscription"
            />
          </section>

        </div>

        <div class="mt-auto pt-10 flex justify-center">
          <SettingLinks />
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/service/toast.service";

import SubPageBar from "@/components/general/SubPageBar.vue";
import SettingLinks from "@/components/settings/SettingLinks.vue";
import SubscriptionManager from "@/components/settings/SubscriptionManager.vue";
import SettingSwitches from "@/components/settings/SettingSwitches.vue";
import AccountSettings from "@/components/settings/AccountSettings.vue";
import { ref } from "vue";
import { NotificationSubscription } from "@/types/server.types";
import { unsubscribe } from "@/service/api/user.api";

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const pendingFingerprint = ref<string | null>(null);

async function handleDeleteSubscription(sub: NotificationSubscription) {
	if (!user.value) return;
	pendingFingerprint.value = sub.fingerprint;
	try {
		await unsubscribe({
			user_id: user.value._id,
			fingerprint: sub.fingerprint,
		});
		user.value.subscriptions = user.value.subscriptions.filter(
			(s) => s.fingerprint !== sub.fingerprint,
		);
	} catch (e) {
		useToast().toast("Could not remove device", { color: "danger" });
	} finally {
		pendingFingerprint.value = null;
	}
}
</script>

<style scoped>
@reference "@/theme/main.css";

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

ion-content::part(scroll) {
  display: flex;
  flex-direction: column;
}
</style>