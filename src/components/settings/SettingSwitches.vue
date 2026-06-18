<template>
  <div v-if="user" class="w-full space-y-2">

    <div class="w-full flex items-center justify-between bg-white/40 border border-primary/10 rounded-2xl p-3 shadow-sm" v-if="isNative()">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ion-icon
            :icon="svg(deviceNotificationsAllowed ? mdiBellRing : mdiBellOff)"
            class="text-xl text-black/70"
          />
        </div>
        <div class="cabin-sketch-regular font-bold text-base text-black flex items-center gap-1" >
          <span>Alerts</span>
          <button id="notif-info" class="flex items-center justify-center p-1 rounded-full active:bg-black/5 transition-colors">
            <ion-icon :icon="svg(mdiInformationOutline)" class="text-sm text-black/30" />
          </button>
        </div>
      </div>

      <div class="shrink-0 flex items-center justify-end min-w-[50px]">
        <ion-spinner
          v-if="notificationToggleBusy"
          name="crescent"
          class="w-5 h-5 text-gray-500"
        />
        <ion-toggle
          v-else
          mode="ios"
          color="secondary"
          :checked="!!deviceNotificationsAllowed"
          :disabled="notificationToggleBusy"
          @ionChange="handleNotificationChange"
        />
      </div>
    </div>

    <div class="w-full flex items-center justify-between bg-white/40 border border-primary/10 rounded-2xl p-3 shadow-sm">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
          <ion-icon :icon="svg(mdiBalloon)" class="text-xl text-secondary" />
        </div>
        <div class="cabin-sketch-regular font-bold text-base text-black flex items-center gap-1">
          <span>Balloons</span>
          <button id="balloon-info" class="flex items-center justify-center p-1 rounded-full active:bg-black/5 transition-colors">
            <ion-icon :icon="svg(mdiInformationOutline)" class="text-sm text-black/30" />
          </button>
        </div>
      </div>

      <div class="shrink-0">
        <ion-toggle
          mode="ios"
          color="secondary"
          :checked="!user.balloon?.disabled"
          :disabled="balloonToggleBusy"
          @ionChange="handleBalloonChange"
        />
      </div>
    </div>

    <ion-popover trigger="balloon-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-sm text-black bg-background border border-primary/20 rounded-2xl">
        <p class="font-bold mb-1 border-b border-secondary/20 pb-1 text-secondary">Incoming Balloons</p>
        <p class="mt-1 leading-snug">
          Toggle off to stop receiving balloons from strangers.
          <strong class="block mt-1 text-xs text-black/60">You can still send balloons to others!</strong>
        </p>
      </div>
    </ion-popover>

    <ion-popover trigger="notif-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-sm text-black bg-background border border-primary/20 rounded-2xl">
        <p class="font-bold mb-1 border-b border-secondary/20 pb-1 text-secondary">Why enable Alerts?</p>
        <ul class="list-disc pl-4 space-y-1 mt-1 leading-snug">
          <li>Receive sketches from your mates</li>
          <li>Receive messages from your mates</li>
          <li v-if="!isNative()">Get daily reminders</li>
        </ul>
      </div>
    </ion-popover>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ToggleCustomEvent } from "@ionic/vue";
import { IonIcon, IonPopover, IonSpinner, IonToggle } from "@ionic/vue";
import { isNative, svg } from "@/helper/general.helper";
import {
	mdiBalloon,
	mdiBellOff,
	mdiBellRing,
	mdiInformationOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";
import {
	disableNotifications,
	requestNotifications,
} from "@/helper/notification.helper";
import { updateUser } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";

const { user } = storeToRefs(useAuthStore());
const { deviceNotificationsAllowed } = storeToRefs(useNotificationStore());

const notificationToggleBusy = ref(false);
const balloonToggleBusy = ref(false);

async function handleNotificationChange(event: ToggleCustomEvent) {
	const desired = event.detail.checked;
	if (desired === !!deviceNotificationsAllowed.value) return;
	if (notificationToggleBusy.value) return;
	notificationToggleBusy.value = true;

	try {
		if (desired) {
			await requestNotifications();
		} else {
			await disableNotifications();
		}
	} catch (e) {
		console.error("Notification toggle failed", e);
		useToast().toast("Something went wrong, please try again", {
			color: "danger",
		});
	} finally {
		notificationToggleBusy.value = false;
	}
}

async function handleBalloonChange(event: ToggleCustomEvent) {
	if (!user.value) return;
	if (!user.value.balloon) user.value.balloon = { disabled: false };

	const desiredEnabled = event.detail.checked;
	const desiredDisabled = !desiredEnabled;
	if (desiredDisabled === user.value.balloon.disabled) return;
	if (balloonToggleBusy.value) return;

	balloonToggleBusy.value = true;
	const previous = user.value.balloon.disabled;
	user.value.balloon.disabled = desiredDisabled;

	try {
		await updateUser({
			_id: user.value._id,
			balloon: { ...user.value.balloon, disabled: desiredDisabled },
		});
	} catch (e) {
		if (user.value?.balloon) user.value.balloon.disabled = previous;
		useToast().toast("Could not update balloon preference", {
			color: "danger",
		});
	} finally {
		balloonToggleBusy.value = false;
	}
}
</script>

<style scoped>
ion-popover::part(content) {
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
</style>