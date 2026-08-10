<template>
  <div v-if="user" class="w-full space-y-2">

    <SettingCard
      v-if="isNative()"
      :icon="deviceNotificationsAllowed ? mdiBellRing : mdiBellOff"
      :interactive="false"
    >
      <template #label>
        <span class="flex items-center gap-1 font-bold text-base text-black">
          <span>Alerts</span>
          <button id="notif-info" class="flex items-center justify-center p-1 rounded-full active:bg-black/5 transition-colors">
            <ion-icon :icon="svg(mdiInformationOutline)" class="text-base text-black/50" />
          </button>
        </span>
      </template>
      <template #trailing>
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
      </template>
    </SettingCard>

    <SettingCard :icon="mdiBalloon" :interactive="false">
      <template #label>
        <span class="flex items-center gap-1 font-bold text-base text-black">
          <span>Balloons</span>
          <button id="balloon-info" class="flex items-center justify-center p-1 rounded-full cursor-pointer active:bg-black/5 transition-colors">
            <ion-icon :icon="svg(mdiInformationOutline)" class="text-base text-black/50" />
          </button>
        </span>
      </template>
      <template #trailing>
        <ion-toggle
          mode="ios"
          color="secondary"
          :checked="!user.balloon?.disabled"
          :disabled="balloonToggleBusy"
          @ionChange="handleBalloonChange"
        />
      </template>
    </SettingCard>

    <SettingCard :icon="profanityFilterOn ? mdiCommentCheckOutline : mdiCommentRemoveOutline" :interactive="false">
      <template #label>
        <span class="flex items-center gap-1 font-bold text-base text-black">
          <span>Hide bad words</span>
          <button id="profanity-info" class="flex items-center justify-center p-1 rounded-full cursor-pointer active:bg-black/5 transition-colors">
            <ion-icon :icon="svg(mdiInformationOutline)" class="text-base text-black/50" />
          </button>
        </span>
      </template>
      <template #trailing>
        <ion-toggle
          mode="ios"
          color="secondary"
          :checked="profanityFilterOn"
          :disabled="profanityToggleBusy"
          @ionChange="handleProfanityChange"
        />
      </template>
    </SettingCard>

    <!-- Competition pushes. One switch for all three sends (new theme, last
         call, results) — a settings maze is worse than an honest label. -->
    <SettingCard v-if="!isUnderAge" :icon="mdiTrophyOutline" :interactive="false">
      <template #label>
        <span class="flex flex-col">
          <span class="font-bold text-base text-black">Weekly competition</span>
          <span class="text-sm text-black/70 leading-snug">New theme, last call and results. Max 3 a week.</span>
        </span>
      </template>
      <template #trailing>
        <ion-toggle
          mode="ios"
          color="secondary"
          :checked="competitionNotificationsOn"
          :disabled="competitionToggleBusy"
          @ionChange="handleCompetitionNotificationsChange"
        />
      </template>
    </SettingCard>

    <div class="w-full bg-tertiary border border-primary/40 rounded-[1.5rem] p-3 shadow-sm">
      <div class="flex items-center gap-3 mb-3">
        <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-secondary/10">
          <ion-icon :icon="svg(mdiViewDashboardOutline)" class="text-xl text-secondary" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-base leading-tight text-black">Home feed</span>
          <span class="block text-base text-black/80 mt-0.5 ">{{ feedLevelSublabel }}</span>
        </span>
      </div>
      <ion-segment
        mode="ios"
        :value="feedLevel"
        :disabled="feedLevelBusy"
        color="primary"
        @ionChange="handleFeedLevelChange"
      >
        <ion-segment-button value="off"><ion-label>Off</ion-label></ion-segment-button>
        <ion-segment-button value="mates"><ion-label>Mates</ion-label></ion-segment-button>
        <ion-segment-button value="open"><ion-label>Open</ion-label></ion-segment-button>
      </ion-segment>
    </div>

    <SettingCard v-if="!isUnderAge" :icon="mdiAccountStarOutline" :interactive="false">
      <template #label>
        <span class="flex flex-col">
          <span class="font-bold text-base text-black">Artist highlights</span>
          <span class="text-sm text-black/70 leading-snug">Meet featured artists in your community feed.</span>
        </span>
      </template>
      <template #trailing>
        <ion-toggle
          mode="ios"
          color="secondary"
          :checked="artistHighlightsOn"
          :disabled="artistHighlightsBusy"
          @ionChange="handleArtistHighlightsChange"
        />
      </template>
    </SettingCard>

    <ion-popover trigger="balloon-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-lg text-black bg-background border border-primary/20 rounded-2xl">
        <p class="font-bold mb-1 border-b border-secondary/20 pb-1 text-secondary">Incoming Balloons</p>
        <p class="mt-1 leading-snug">
          Toggle off to stop receiving balloons from strangers.
          <strong class="block mt-1 text-sm text-black/60">You can still send balloons to others!</strong>
        </p>
      </div>
    </ion-popover>

    <ion-popover trigger="profanity-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-lg text-black bg-background border border-primary/20 rounded-2xl">
        <p class="font-bold mb-1 border-b border-secondary/20 pb-1 text-secondary">Hide bad words</p>
        <p class="mt-1 leading-snug">
          Swears in chats, rooms and comments show up as ****.
          <strong class="block mt-1 text-sm text-black/60">Only changes what you see — nobody is told, and nothing you write is changed.</strong>
        </p>
      </div>
    </ion-popover>

    <ion-popover trigger="notif-info" trigger-action="click" class="cabin-sketch-regular">
      <div class="p-4 text-lg text-black bg-background border border-primary/20 rounded-2xl">
        <p class="font-bold text-lg mb-1 border-b border-secondary/20 pb-1 text-secondary">Why enable Alerts?</p>
        <ul class="list-disc pl-4 space-y-1 mt-1 leading-snug text-lg">
          <li>Receive sketches from your mates</li>
          <li>Receive messages from your mates</li>
          <li v-if="!isNative()">Get daily reminders</li>
        </ul>
      </div>
    </ion-popover>
  </div>
</template>

<script setup lang="ts">
import type { ToggleCustomEvent } from "@ionic/vue";
import {
	IonIcon,
	IonLabel,
	IonPopover,
	IonSegment,
	IonSegmentButton,
	IonSpinner,
	IonToggle,
} from "@ionic/vue";
import {
	mdiAccountStarOutline,
	mdiBalloon,
	mdiBellOff,
	mdiBellRing,
	mdiCommentCheckOutline,
	mdiCommentRemoveOutline,
	mdiInformationOutline,
	mdiTrophyOutline,
	mdiViewDashboardOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import SettingCard from "@/components/settings/SettingCard.vue";
import { svg } from "@/helper/general.helper";
import {
	disableNotifications,
	requestNotifications,
} from "@/helper/notification.helper";
import { isNative } from "@/helper/platform.helper";
import { updateArtistHighlightPreferences } from "@/service/api/artistHighlight.api";
import { updateCompetitionPreferences } from "@/service/api/competition.api";
import { updateUser } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";

const { user, isUnderAge } = storeToRefs(useAuthStore());
const { deviceNotificationsAllowed } = storeToRefs(useNotificationStore());

const notificationToggleBusy = ref(false);
const balloonToggleBusy = ref(false);
const feedLevelBusy = ref(false);
const profanityToggleBusy = ref(false);
const competitionToggleBusy = ref(false);
const artistHighlightsBusy = ref(false);

const artistHighlightsOn = computed(() => {
	if (user.value?.artist_highlights?.enabled === false) return false;
	const snoozedUntil = user.value?.artist_highlights?.snoozed_until;
	return !snoozedUntil || new Date(snoozedUntil).getTime() <= Date.now();
});

// Defaults on: undefined means a user who predates the field, not opted out.
const competitionNotificationsOn = computed(
	() => (user.value as any)?.competition?.notifications !== false,
);

// Undefined means on: accounts created before this setting existed have no
// field, and "unknown" should read as filtered for an audience this young.
const profanityFilterOn = computed(
	() => user.value?.profanity_filter !== false,
);

type FeedLevel = "off" | "mates" | "open";
const feedLevel = computed<FeedLevel>(() => user.value?.feed_level ?? "open");
const feedLevelSublabel = computed(() => {
	switch (feedLevel.value) {
		case "off":
			return "No feed on your home screen.";
		case "mates":
			return "Only posts from your mates and follows.";
		default:
			return "Mates first, then discover other artists.";
	}
});

async function handleFeedLevelChange(event: CustomEvent) {
	const val = (event.detail as { value?: FeedLevel }).value;
	if (!user.value || !val || val === feedLevel.value) return;
	if (feedLevelBusy.value) return;

	feedLevelBusy.value = true;
	const previous = user.value.feed_level;
	user.value.feed_level = val;

	try {
		await updateUser({ _id: user.value._id, feed_level: val });
	} catch (e) {
		if (user.value) user.value.feed_level = previous;
		useToast().toast("Could not update feed preference", { color: "danger" });
	} finally {
		feedLevelBusy.value = false;
	}
}

async function handleProfanityChange(event: ToggleCustomEvent) {
	if (!user.value) return;
	const desired = event.detail.checked;
	if (desired === profanityFilterOn.value) return;
	if (profanityToggleBusy.value) return;

	profanityToggleBusy.value = true;
	const previous = user.value.profanity_filter;
	// Optimistic: every message already on screen re-renders against the twin
	// the server sent with it, so the switch is instant and needs no refetch.
	user.value.profanity_filter = desired;

	try {
		await updateUser({ _id: user.value._id, profanity_filter: desired });
	} catch (e) {
		if (user.value) user.value.profanity_filter = previous;
		useToast().toast("Could not update word filter", { color: "danger" });
	} finally {
		profanityToggleBusy.value = false;
	}
}

async function handleCompetitionNotificationsChange(event: ToggleCustomEvent) {
	if (!user.value) return;
	const desired = event.detail.checked;
	if (desired === competitionNotificationsOn.value) return;
	if (competitionToggleBusy.value) return;

	competitionToggleBusy.value = true;
	const previous = (user.value as any).competition;

	// Optimistic, and merged rather than replaced — the same object carries
	// `wins` and `last_seen_results_week`.
	(user.value as any).competition = {
		...(previous ?? {}),
		notifications: desired,
	};

	try {
		await updateCompetitionPreferences(desired);
	} catch (e) {
		if (user.value) (user.value as any).competition = previous;
		useToast().toast("Could not update competition alerts", {
			color: "danger",
		});
	} finally {
		competitionToggleBusy.value = false;
	}
}

async function handleArtistHighlightsChange(event: ToggleCustomEvent) {
	if (!user.value || artistHighlightsBusy.value) return;
	const desired = event.detail.checked;
	if (desired === artistHighlightsOn.value) return;

	artistHighlightsBusy.value = true;
	const previous = user.value.artist_highlights;
	user.value.artist_highlights = {
		...(previous ?? {}),
		enabled: desired,
		...(desired ? { snoozed_until: null } : {}),
	};
	try {
		await updateArtistHighlightPreferences({ enabled: desired });
	} catch {
		if (user.value) user.value.artist_highlights = previous;
		useToast().toast("Could not update artist highlights", { color: "danger" });
	} finally {
		artistHighlightsBusy.value = false;
	}
}

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
