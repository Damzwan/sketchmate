<template>
  <div v-if="user" class="mx-auto max-w-100">
    <!-- Alerts Toggle -->
    <ion-item lines="none" color="tertiary" class="ion-no-padding px-2">
      <ion-icon
        slot="start"
        :icon="svg(deviceNotificationsAllowed ? mdiBellRing : mdiBellOff)"
        class="text-gray-600 mr-2"
      />
      <ion-label class="cabin-sketch-regular font-bold text-lg">
        Alerts
        <ion-button fill="clear" id="notif-info" class="h-6 w-6 m-0 p-0">
          <ion-icon
            slot="icon-only"
            :icon="svg(mdiInformationOutline)"
            size="small"
            class="text-gray-400"
          />
        </ion-button>
      </ion-label>

      <ion-spinner
        v-if="notificationToggleBusy"
        slot="end"
        name="crescent"
        class="text-gray-500"
      />
      <ion-toggle
        v-else
        slot="end"
        mode="ios"
        color="secondary"
        :checked="!!deviceNotificationsAllowed"
        :disabled="notificationToggleBusy"
        @ionChange="handleNotificationChange"
      />
    </ion-item>

    <!-- Balloons Toggle -->
    <ion-item lines="none" color="tertiary" class="ion-no-padding px-2">
      <ion-icon slot="start" :icon="svg(mdiBalloon)" class="text-secondary mr-2" />
      <ion-label class="cabin-sketch-regular font-bold text-lg">
        Balloons
        <ion-button fill="clear" id="balloon-info" class="h-6 w-6 m-0 p-0">
          <ion-icon
            slot="icon-only"
            :icon="svg(mdiInformationOutline)"
            size="small"
            class="text-gray-400"
          />
        </ion-button>
      </ion-label>
      <ion-toggle
        slot="end"
        mode="ios"
        color="secondary"
        :checked="!user.balloon?.disabled"
        :disabled="balloonToggleBusy"
        @ionChange="handleBalloonChange"
      />
    </ion-item>

    <!-- Popovers -->
    <ion-popover trigger="balloon-info" trigger-action="click" class="cabin-sketch-regular shadow-lg">
      <div class="p-4 text-sm text-black bg-tertiary">
        <p class="font-bold mb-1 underline decoration-secondary">Incoming Balloons</p>
        <p>
          Toggle off to stop receiving balloons from strangers.
          <strong>You can still send balloons to others!</strong>
        </p>
      </div>
    </ion-popover>

    <ion-popover trigger="notif-info" trigger-action="click" class="cabin-sketch-regular shadow-lg">
      <div class="p-4 text-sm text-black bg-tertiary">
        <p class="font-bold mb-2 underline decoration-secondary">Why enable Alerts?</p>
        <ul class="list-disc pl-4 space-y-1">
          <li>Receive sketches from your friends</li>
          <li v-if="!isNative()">Get daily reminders</li>
        </ul>
      </div>
    </ion-popover>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ToggleCustomEvent } from "@ionic/vue";
import {
	IonButton,
	IonIcon,
	IonItem,
	IonLabel,
	IonPopover,
	IonSpinner,
	IonToggle,
} from "@ionic/vue";
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
		// Rollback
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
ion-popover {
  --background: var(--ion-color-tertiary);
  --backdrop-opacity: 0.2;
}

ion-popover::part(content) {
  border-radius: 20px;
  border: 2px solid rgba(0, 0, 0, 0.05);
}

ion-item {
  --padding-start: 0;
  --inner-padding-end: 0;
}
</style>