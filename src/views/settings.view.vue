<template>
  <ion-page class="slide-page">
    <SubPageBar title="Settings" />

    <ion-content class="bg-background ">

      <div
        class="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-4 mb-8 pb-[calc(3rem+var(--ion-safe-area-bottom,32px))] flex flex-col min-h-full cabin-sketch-regular">

        <div class="grow space-y-6">

          <section>
            <h3 class="text-lg font-bold text-black/90 px-1 mb-2 uppercase tracking-widest">
              Account
            </h3>
            <AccountSettings />
          </section>

          <section>
            <h3 class="text-lg font-bold text-black/90 px-1 mb-2 uppercase tracking-widest">
              Preferences
            </h3>
            <SettingSwitches />
          </section>

          <section v-if="user?.subscriptions?.length" class="animate-fade-in">
            <h3 class="text-lg font-bold text-black/90 px-1 mb-2 uppercase tracking-widest">
              Network Sync
            </h3>
            <SubscriptionManager
              :subscriptions="user.subscriptions"
              :pending-fingerprint="pendingFingerprint"
              @delete="handleDeleteSubscription"
            />
          </section>

          <section>
            <h3 class="text-lg font-bold text-black/90 px-1 mb-2 uppercase tracking-widest">
              More
            </h3>
            <SettingLinks />
            <div class="h-12 w-full aria-hidden"></div>
          </section>

        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonPage } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import SubPageBar from "@/components/general/SubPageBar.vue";
import AccountSettings from "@/components/settings/AccountSettings.vue";
import SettingLinks from "@/components/settings/SettingLinks.vue";
import SettingSwitches from "@/components/settings/SettingSwitches.vue";
import SubscriptionManager from "@/components/settings/SubscriptionManager.vue";
import { unsubscribe } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { NotificationSubscription } from "@/types/server.types";

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