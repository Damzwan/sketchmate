<template>
  <!-- Why the weekly limit exists.
       Two rewrites got this wrong in opposite directions: three headed
       paragraphs (too much reading), then two bullets (a rule with no reason,
       which just reads as stingy). The problem was the voice, not the length —
       product copy explaining a restriction always sounds like a policy.
       Coming from the person who built it, the same information is a note from
       someone who cares, so it earns the room to say why. -->
  <BaseSheetModal
    :is-open="open"
    title="Take it slow"
    subtitle="New mates per week"
    @close="$emit('update:open', false)"
  >
    <div class="space-y-4 pb-1">

      <div
        class="rounded-[1.6rem] border p-4 text-center"
        :class="limitReached ? 'border-amber-400/50 bg-amber-100/60' : 'border-primary/40 bg-tertiary'"
      >
        <p class="text-2xl font-black text-black leading-none">
          {{ headline }}
        </p>
        <p v-if="resetLine" class="text-sm text-black/80 mt-1.5">
          {{ resetLine }}
        </p>
      </div>

      <DevNote title="SketchMate Big Boss">
        <p>
          I really want you to build strong friendships here. Real connections take time, it is not a race.
        </p>
        <p>
          That’s why I limit new additions to
          <span class="text-secondary font-black">{{ allowance }} a week</span> so you have the space to connect with the people you add.
        </p>
        <p>
          If you'd like to support the project and remove the limit entirely, you can check out Pro below. Either way, take your time!
        </p>
      </DevNote>
    </div>

    <template v-if="canUpgrade" #footer>
      <ion-button expand="block" color="secondary" shape="round" size="large" class="m-0" @click="upgrade">
        <ion-icon :icon="svg(mdiStar)" slot="start" class="mr-1 text-base" />
        Go Pro for unlimited
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiHeart, mdiStar } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import DevNote from "@/components/general/DevNote.vue";
import { useQuotaStore } from "@/store/quota.store";
import { useSubscriptionStore } from "@/store/subscription.store";

dayjs.extend(relativeTime);

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(["update:open"]);

const quotaStore = useQuotaStore();
const subStore = useSubscriptionStore();

const limitReached = computed(() => quotaStore.mateWeeklyLimitReached);
const canUpgrade = computed(
	() => !subStore.isPro && quotaStore.mates.limit !== null,
);

const headline = computed(() => {
	const { limit, remaining } = quotaStore.mates;
	if (limit === null) return "No limit";
	// Phrased off `remaining`, so it stays correct if the free allowance ever
	// changes — "you've used your slot" would read wrong at a limit of 3.
	if (remaining <= 0) return "No new mates left";
	return remaining === 1 ? "1 new mate left" : `${remaining} new mates left`;
});

// Only meaningful once a slot has actually been spent — the server sends
// `reset_at` as the moment the OLDEST counted mate ages out of the window.
const resetLine = computed(() => {
	const resetAt = quotaStore.mates.reset_at;
	if (!resetAt || quotaStore.mates.limit === null) return "";
	const when = dayjs(resetAt);
	if (!when.isValid() || when.isBefore(dayjs())) return "";
	return `Next one ${when.fromNow()}`;
});

/** "one new mate" / "3 new mates" — the allowance is config, never hardcode it. */
const allowance = computed(() => {
	const limit = quotaStore.mates.limit;
	if (limit === null) return "";
	return limit === 1 ? "one new mate" : `${limit} new mates`;
});

function upgrade() {
	emit("update:open", false);
	subStore.openPaywall();
}

// Keep the sheet's numbers honest whenever it's opened: the quota can have
// moved (a mate accepted on another device, a slot ageing out) since the last
// fetch, and this is the one surface where a stale count is the whole message.
watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) void quotaStore.refresh(true);
	},
);
</script>
