<template>
  <!-- No `scrollable`: that prop swaps the sheet's `--height: auto` for
       `100%`, which is why this was opening full-screen for what is a rail, a
       paragraph and one button. Auto-height lets it hug its content and stop,
       with the base sheet's own `--max-height: 95vh` as the ceiling. -->
  <BaseSheetModal
    :is-open="open"
    title="Connections"
    subtitle="How it works"
    @close="$emit('update:open', false)"
  >
    <!-- Where they are, before what it means. The rail is interactive: each
         node explains its own step, so the copy is pulled rather than dumped
         as a wall of text. -->
    <div class="py-3">
      <RelationshipJourney :step="rel.step" :accent="rel.accent" />
    </div>

    <p class="text-lg text-black/80 leading-snug text-center px-1">
      The goal is real friendships, not a leaderboard. You can only have so many
      people who matter, so a 24-hour trial lets both of you find out if it fits
      before it becomes permanent.
    </p>

    <!-- Where they stand right now, in their own words rather than the generic
         explainer above. -->
    <div class="mt-5 rounded-2xl bg-white border border-primary/20 px-4 py-3.5 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full shrink-0" :class="accent.dot" />
        <span class="text-sm font-black uppercase tracking-wider" :class="accent.text">
          {{ rel.label }}
        </span>
        <span v-if="countdown" class="ml-auto text-sm font-black uppercase tracking-wider text-black/80">
          {{ countdown }}
        </span>
      </div>
      <p class="mt-2 text-base text-black/80 leading-snug">
        {{ statusDetail }}
      </p>

      <!-- Stated plainly, and stated HERE rather than as a toast after a failed
           tap. A boundary the user can see is a rule; one they only discover by
           hitting it is a bug, as far as they're concerned. -->
      <p
        v-if="longReason"
        class="mt-3 pt-3 border-t border-primary/20 text-sm text-black/80 leading-snug"
      >
        {{ longReason }}
      </p>
    </div>

    <!-- Actions that aren't decisions. The banner owns accept/decline; this
         owns what a user chooses to do on their own initiative. -->
    <template #footer>
      <div v-if="actions.length" class="flex flex-col gap-2">
        <ion-button
          v-for="a in actions"
          :key="a.label"
          :color="a.color ?? 'secondary'"
          :fill="a.fill ?? 'solid'"
          shape="round"
          class="cursor-pointer"
          @click="run(a.run)"
        >
          <ion-icon v-if="a.icon" :icon="svg(a.icon)" slot="start" class="text-base mr-1" />
          {{ a.label }}
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiHeart, mdiStar } from "@mdi/js";
import { useNow } from "@vueuse/core";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import {
	RELATIONSHIP_ACCENT,
	resolveRelationship,
} from "@/config/relationship.config";
import RelationshipJourney from "./RelationshipJourney.vue";
import { useRelationshipActions } from "@/composables/chat/useRelationshipActions";
import { useMateRequestGate } from "@/composables/chat/useMateRequestGate";
import { useQuotaStore } from "@/store/quota.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";

const props = defineProps<{
	open: boolean;
	chat: any;
	partner: any;
	currentUserId?: string;
}>();
const emit = defineEmits(["update:open"]);

const quotaStore = useQuotaStore();
const chatWidget = useChatWidgetStore();
const { requestMate, cancelMate } = useRelationshipActions(() => props.chat);

const now = useNow({ interval: 60_000 });
const { canRequest, longReason } = useMateRequestGate(() => props.chat, now);

const rel = computed(() =>
	resolveRelationship({
		status: props.chat?.status,
		initiatorId: props.chat?.initiator_id,
		currentUserId: props.currentUserId,
		trialExpiresAt: props.chat?.trial_expires_at,
	}),
);

const accent = computed(() => RELATIONSHIP_ACCENT[rel.value.accent]);
const firstName = computed(() => props.partner?.name?.split(" ")[0] || "them");

const countdown = computed(() => {
	const expiry = props.chat?.trial_expires_at;
	if (rel.value.kind !== "trial" || !expiry) return "";
	const mins = dayjs(expiry).diff(dayjs(now.value), "minute");
	if (mins <= 0) return "";
	if (mins < 60) return `${mins}m left`;
	return `${Math.floor(mins / 60)}h left`;
});

const statusDetail = computed(() => {
	switch (rel.value.kind) {
		case "trial":
			return `You and ${firstName.value} are in a 24-hour trial. Sketch, chat, and see how it goes — become Mates any time before it runs out.`;
		case "outgoing_invite":
			return `Your invite is with ${firstName.value}. Once they accept, the 24-hour trial starts.`;
		case "outgoing_mate":
			return `You asked ${firstName.value} to be Mates. Nothing to do but wait — you can take it back below.`;
		case "trial_expired":
			return `The trial with ${firstName.value} has run out. Becoming Mates keeps the thread alive.`;
		case "expired":
			return "This connection has ended. The history stays for a while, then clears itself.";
		default:
			return rel.value.hint || "You're connected.";
	}
});

interface InfoAction {
	label: string;
	run: () => void | Promise<void>;
	icon?: string;
	color?: string;
	fill?: "clear" | "solid";
}

const actions = computed<InfoAction[]>(() => {
	const out: InfoAction[] = [];

	if (rel.value.kind === "trial") {
		// `longReason` is rendered below instead — this is the one surface with
		// room to explain WHY the option is gone, so it does.
		if (!canRequest.value) {
			// no action
		} else if (quotaStore.canAddMate) {
			out.push({ label: "Become Mates", run: requestMate, icon: mdiHeart });
		} else if (quotaStore.mateWeeklyLimitReached) {
			// Hands off to the sheet that owns this explanation rather than
			// duplicating a second, thinner version of it here.
			out.push({
				label: "Why can't I add them?",
				run: chatWidget.openMateQuotaInfo,
				icon: mdiStar,
			});
		}
	}

	if (rel.value.kind === "outgoing_mate") {
		out.push({
			label: "Cancel request",
			run: cancelMate,
			color: "dark",
			fill: "clear",
		});
	}

	return out;
});

// Every action here either ends the state or opens another surface, so the
// sheet has nothing left to say once one is taken.
async function run(fn: () => void | Promise<void>) {
	await fn();
	emit("update:open", false);
}
</script>
